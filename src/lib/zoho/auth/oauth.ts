import { z } from "zod";
import {
  ZOHO_DATA_CENTERS,
  ZOHO_INVENTORY_OAUTH_SCOPE,
  type ZohoDataCenter,
  type ZohoOAuthTokenResponse,
} from "@/lib/zoho/types";
import {
  ZohoAuthenticationError,
  ZohoConfigurationError,
  ZohoMalformedResponseError,
  ZohoNetworkError,
} from "@/lib/zoho/errors";
import { logger } from "@/lib/logging";

export interface ZohoOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  dataCenter: ZohoDataCenter;
}

/**
 * Reads and validates the OAuth app configuration from the environment.
 * Throws ZohoConfigurationError (never a raw value) listing which variables
 * are missing — this is expected to throw until real Zoho credentials are
 * added, per the Phase 1 credential rule.
 */
export function getZohoOAuthConfig(): ZohoOAuthConfig {
  const missing: string[] = [];
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const dataCenterRaw = process.env.ZOHO_DATA_CENTER;

  if (!clientId) missing.push("ZOHO_CLIENT_ID");
  if (!clientSecret) missing.push("ZOHO_CLIENT_SECRET");
  if (!redirectUri) missing.push("ZOHO_REDIRECT_URI");
  if (!dataCenterRaw) missing.push("ZOHO_DATA_CENTER");

  if (missing.length > 0) {
    throw new ZohoConfigurationError(
      `Zoho is not configured yet — missing environment variable(s): ${missing.join(", ")}.`,
    );
  }

  const dataCenterResult = z.enum(ZOHO_DATA_CENTERS).safeParse(dataCenterRaw);
  if (!dataCenterResult.success) {
    throw new ZohoConfigurationError(
      `ZOHO_DATA_CENTER must be one of: ${ZOHO_DATA_CENTERS.join(", ")}.`,
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    dataCenter: dataCenterResult.data,
  };
}

/** Whether Zoho OAuth is configured, without throwing — used for UI status display. */
export function isZohoConfigured(): boolean {
  try {
    getZohoOAuthConfig();
    return true;
  } catch {
    return false;
  }
}

export function getAccountsBaseUrl(dataCenter: ZohoDataCenter): string {
  return `https://accounts.zoho.${dataCenter}`;
}

export function getApiBaseUrl(dataCenter: ZohoDataCenter): string {
  return `https://www.zohoapis.${dataCenter}`;
}

export function buildAuthorizationUrl(config: ZohoOAuthConfig, state: string): string {
  const url = new URL("/oauth/v2/auth", getAccountsBaseUrl(config.dataCenter));
  url.searchParams.set("scope", ZOHO_INVENTORY_OAUTH_SCOPE);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  api_domain: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().positive(),
});

type FetchLike = typeof fetch;

async function postToTokenEndpoint(
  config: ZohoOAuthConfig,
  params: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<ZohoOAuthTokenResponse> {
  const url = new URL("/oauth/v2/token", getAccountsBaseUrl(config.dataCenter));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { method: "POST" });
  } catch (err) {
    // Never log `params` here — it contains client_secret/code/refresh_token.
    logger.error({ err }, "Network error calling Zoho OAuth token endpoint");
    throw new ZohoNetworkError("Could not reach Zoho's OAuth token endpoint.", err);
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok || !json) {
    logger.warn({ status: response.status }, "Zoho OAuth token endpoint returned an error");
    throw new ZohoAuthenticationError(`Zoho token endpoint returned HTTP ${response.status}.`);
  }

  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ZohoMalformedResponseError("Zoho's token response did not match the expected shape.");
  }
  return parsed.data;
}

export function exchangeCodeForTokens(
  config: ZohoOAuthConfig,
  authorizationCode: string,
  fetchImpl: FetchLike = fetch,
): Promise<ZohoOAuthTokenResponse> {
  return postToTokenEndpoint(
    config,
    {
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code: authorizationCode,
    },
    fetchImpl,
  );
}

export function refreshAccessToken(
  config: ZohoOAuthConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<ZohoOAuthTokenResponse> {
  return postToTokenEndpoint(
    config,
    {
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    },
    fetchImpl,
  );
}

/**
 * Best-effort revoke of a refresh token with Zoho. Never throws — disconnect
 * must always succeed locally even if Zoho is unreachable or already
 * considers the token invalid; callers should log the boolean result.
 */
export async function revokeRefreshToken(
  config: ZohoOAuthConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const url = new URL("/oauth/v2/token/revoke", getAccountsBaseUrl(config.dataCenter));
    url.searchParams.set("token", refreshToken);
    const response = await fetchImpl(url.toString(), { method: "POST" });
    return response.ok;
  } catch (err) {
    logger.warn({ err }, "Zoho token revoke call failed (continuing with local disconnect)");
    return false;
  }
}
