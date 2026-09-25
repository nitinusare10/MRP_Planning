import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  disconnectConnection,
  getLatestConnection,
  getValidAccessToken,
  saveConnectionFromTokens,
} from "@/lib/zoho/auth/connection";
import { decryptSecret } from "@/lib/zoho/auth/encryption";
import { ZohoAuthenticationError, ZohoNotConnectedError } from "@/lib/zoho/errors";
import { createTestUser, cleanupIds } from "../helpers";
import { uniqueSuffix } from "./helpers";

describe("Zoho connection management (DB + encryption integration)", () => {
  const createdUsers: string[] = [];

  afterEach(async () => {
    await prisma.zohoConnection.deleteMany({}); // single-connection-row design; safe to clear between tests
    await cleanupIds({ user: createdUsers.splice(0) });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws ZohoNotConnectedError when nothing has ever connected", async () => {
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(ZohoNotConnectedError);
  });

  it("stores tokens encrypted at rest and returns the decrypted access token when valid", async () => {
    const user = await createTestUser({ role: "ADMIN" });
    createdUsers.push(user.id);

    await saveConnectionFromTokens({
      organizationId: `org-${uniqueSuffix()}`,
      tokens: {
        access_token: "plain-access-token",
        refresh_token: "plain-refresh-token",
        api_domain: "https://www.zohoapis.in",
        token_type: "Bearer",
        expires_in: 3600,
      },
      connectedById: user.id,
    });

    const raw = await getLatestConnection();
    expect(raw?.accessTokenEncrypted).not.toContain("plain-access-token");
    expect(raw?.refreshTokenEncrypted).not.toContain("plain-refresh-token");
    expect(raw ? decryptSecret(raw.accessTokenEncrypted) : null).toBe("plain-access-token");

    const resolved = await getValidAccessToken();
    expect(resolved.accessToken).toBe("plain-access-token");
    expect(resolved.apiDomain).toBe("https://www.zohoapis.in");
  });

  it("refuses to save a connection when Zoho didn't return a refresh token", async () => {
    const user = await createTestUser({ role: "ADMIN" });
    createdUsers.push(user.id);

    await expect(
      saveConnectionFromTokens({
        organizationId: "org-1",
        tokens: {
          access_token: "at",
          api_domain: "https://www.zohoapis.in",
          token_type: "Bearer",
          expires_in: 3600,
        },
        connectedById: user.id,
      }),
    ).rejects.toBeInstanceOf(ZohoAuthenticationError);

    expect(await getLatestConnection()).toBeNull();
  });

  it("transparently refreshes an about-to-expire token and persists the new one", async () => {
    const user = await createTestUser({ role: "ADMIN" });
    createdUsers.push(user.id);

    vi.stubEnv("ZOHO_CLIENT_ID", "id");
    vi.stubEnv("ZOHO_CLIENT_SECRET", "secret");
    vi.stubEnv("ZOHO_REDIRECT_URI", "https://example.com/cb");
    vi.stubEnv("ZOHO_DATA_CENTER", "in");

    await saveConnectionFromTokens({
      organizationId: `org-${uniqueSuffix()}`,
      tokens: {
        access_token: "old-token",
        refresh_token: "refresh-token",
        api_domain: "https://www.zohoapis.in",
        token_type: "Bearer",
        expires_in: 3600,
      },
      connectedById: user.id,
    });
    // Force it into "expires soon" territory.
    const conn = await getLatestConnection();
    await prisma.zohoConnection.update({
      where: { id: conn!.id },
      data: { tokenExpiresAt: new Date(Date.now() + 30_000) }, // 30s left, under the 2-minute safety margin
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "new-token",
              api_domain: "https://www.zohoapis.in",
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      ),
    );

    const resolved = await getValidAccessToken();
    expect(resolved.accessToken).toBe("new-token");

    const afterRefresh = await getLatestConnection();
    expect(afterRefresh?.lastRefreshedAt).not.toBeNull();
    expect(afterRefresh ? decryptSecret(afterRefresh.accessTokenEncrypted) : null).toBe(
      "new-token",
    );
  });

  it("disconnect marks REVOKED and wipes the stored ciphertext", async () => {
    const user = await createTestUser({ role: "ADMIN" });
    createdUsers.push(user.id);

    await saveConnectionFromTokens({
      organizationId: `org-${uniqueSuffix()}`,
      tokens: {
        access_token: "at",
        refresh_token: "rt",
        api_domain: "https://www.zohoapis.in",
        token_type: "Bearer",
        expires_in: 3600,
      },
      connectedById: user.id,
    });

    await disconnectConnection();

    const after = await getLatestConnection();
    expect(after?.status).toBe("REVOKED");
    expect(after ? decryptSecret(after.accessTokenEncrypted) : null).toBe("");
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(ZohoNotConnectedError);
  });
});
