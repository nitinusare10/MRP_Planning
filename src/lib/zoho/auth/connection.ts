import { prisma } from "@/lib/db";
import type { Prisma, ZohoConnection } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/zoho/auth/encryption";
import { getZohoOAuthConfig, refreshAccessToken, revokeRefreshToken } from "@/lib/zoho/auth/oauth";
import { ZohoAuthenticationError } from "@/lib/zoho/errors";
import { ZohoConnectionInvalidError, ZohoNotConnectedError } from "@/lib/zoho/errors";
import type { ResolvedZohoConnection, ZohoOAuthTokenResponse } from "@/lib/zoho/types";
import { logger } from "@/lib/logging";

/** Refresh proactively if the access token expires within this window. */
const REFRESH_SAFETY_MARGIN_MS = 2 * 60 * 1000;

/** Public, non-sensitive view of the connection — safe to send to the browser. */
export interface ZohoConnectionStatus {
  connected: boolean;
  status: ZohoConnection["status"] | null;
  zohoOrganizationId: string | null;
  apiDomain: string | null;
  connectedAt: Date | null;
  lastRefreshedAt: Date | null;
}

export function toConnectionStatus(connection: ZohoConnection | null): ZohoConnectionStatus {
  if (!connection) {
    return {
      connected: false,
      status: null,
      zohoOrganizationId: null,
      apiDomain: null,
      connectedAt: null,
      lastRefreshedAt: null,
    };
  }
  return {
    connected: connection.status === "CONNECTED",
    status: connection.status,
    zohoOrganizationId: connection.zohoOrganizationId,
    apiDomain: connection.apiDomain,
    connectedAt: connection.connectedAt,
    lastRefreshedAt: connection.lastRefreshedAt,
  };
}

/** Most recent connection row regardless of status — for status display. */
export function getLatestConnection(): Promise<ZohoConnection | null> {
  return prisma.zohoConnection.findFirst({ orderBy: { connectedAt: "desc" } });
}

function getActiveConnection(): Promise<ZohoConnection | null> {
  return prisma.zohoConnection.findFirst({
    where: { status: "CONNECTED" },
    orderBy: { connectedAt: "desc" },
  });
}

/**
 * Persists a successful OAuth exchange. Single-company system: reuses the
 * most recent connection row if one exists (upsert-in-place) rather than
 * accumulating a new row per connect/reconnect cycle.
 */
export async function saveConnectionFromTokens(params: {
  organizationId: string;
  tokens: ZohoOAuthTokenResponse;
  connectedById: string;
}): Promise<void> {
  const { organizationId, tokens, connectedById } = params;
  if (!tokens.refresh_token) {
    // Zoho only omits refresh_token when access_type=offline wasn't honored
    // (e.g. re-consent without prompt=consent) — without one we can't stay
    // connected past the access token's ~1hr lifetime, so treat as a config
    // problem rather than silently storing a connection that will shortly
    // stop working.
    throw new ZohoAuthenticationError(
      "Zoho did not return a refresh token. Reconnect and ensure the consent screen is shown (prompt=consent).",
    );
  }

  const existing = await prisma.zohoConnection.findFirst({ orderBy: { connectedAt: "desc" } });
  const data: Prisma.ZohoConnectionUncheckedCreateInput = {
    zohoOrganizationId: organizationId,
    accessTokenEncrypted: encryptSecret(tokens.access_token),
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    apiDomain: tokens.api_domain,
    connectedById,
    status: "CONNECTED",
  };

  if (existing) {
    await prisma.zohoConnection.update({
      where: { id: existing.id },
      data: { ...data, connectedAt: new Date(), lastRefreshedAt: null },
    });
  } else {
    await prisma.zohoConnection.create({ data });
  }
}

/**
 * Returns a usable access token, transparently refreshing it first if it's
 * expired or about to expire. This is the only function the API client
 * should call to get a token — it never returns a stale one.
 */
export async function getValidAccessToken(
  options: { forceRefresh?: boolean } = {},
): Promise<ResolvedZohoConnection> {
  const connection = await getActiveConnection();
  if (!connection) {
    throw new ZohoNotConnectedError();
  }

  const expiresSoon = connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_SAFETY_MARGIN_MS;
  if (!expiresSoon && !options.forceRefresh) {
    return {
      connectionId: connection.id,
      zohoOrganizationId: connection.zohoOrganizationId,
      apiDomain: connection.apiDomain,
      accessToken: decryptSecret(connection.accessTokenEncrypted),
      tokenExpiresAt: connection.tokenExpiresAt,
    };
  }

  try {
    const config = getZohoOAuthConfig();
    const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
    const tokens = await refreshAccessToken(config, refreshToken);

    const updated = await prisma.zohoConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encryptSecret(tokens.access_token),
        // Zoho's refresh grant usually doesn't rotate the refresh token;
        // only overwrite it if a new one was actually issued.
        ...(tokens.refresh_token
          ? { refreshTokenEncrypted: encryptSecret(tokens.refresh_token) }
          : {}),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        apiDomain: tokens.api_domain,
        lastRefreshedAt: new Date(),
        status: "CONNECTED",
      },
    });

    return {
      connectionId: updated.id,
      zohoOrganizationId: updated.zohoOrganizationId,
      apiDomain: updated.apiDomain,
      accessToken: decryptSecret(updated.accessTokenEncrypted),
      tokenExpiresAt: updated.tokenExpiresAt,
    };
  } catch (err) {
    if (err instanceof ZohoAuthenticationError) {
      logger.warn(
        { connectionId: connection.id },
        "Zoho token refresh failed — marking connection EXPIRED",
      );
      await prisma.zohoConnection.update({
        where: { id: connection.id },
        data: { status: "EXPIRED" },
      });
      throw new ZohoConnectionInvalidError();
    }
    throw err;
  }
}

/**
 * Marks the connection revoked and wipes the stored ciphertext (the schema
 * requires the token columns to stay non-null, so they're overwritten with
 * the encryption of an empty string rather than left holding a possibly-
 * revoked secret). Best-effort revoke with Zoho itself; always succeeds
 * locally even if that call fails.
 */
export async function disconnectConnection(): Promise<void> {
  const connection = await getActiveConnection();
  if (!connection) {
    throw new ZohoNotConnectedError();
  }

  try {
    const config = getZohoOAuthConfig();
    const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
    await revokeRefreshToken(config, refreshToken);
  } catch (err) {
    logger.warn(
      { err },
      "Could not attempt remote Zoho token revoke (disconnecting locally anyway)",
    );
  }

  await prisma.zohoConnection.update({
    where: { id: connection.id },
    data: {
      status: "REVOKED",
      accessTokenEncrypted: encryptSecret(""),
      refreshTokenEncrypted: encryptSecret(""),
    },
  });
}
