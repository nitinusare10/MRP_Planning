import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getZohoOAuthConfig,
  isZohoConfigured,
  refreshAccessToken,
  revokeRefreshToken,
} from "@/lib/zoho/auth/oauth";
import {
  ZohoAuthenticationError,
  ZohoConfigurationError,
  ZohoMalformedResponseError,
  ZohoNetworkError,
} from "@/lib/zoho/errors";
import { ZOHO_INVENTORY_OAUTH_SCOPES } from "@/lib/zoho/types";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json" },
  });
}

describe("Zoho OAuth configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws ZohoConfigurationError listing missing variables", () => {
    vi.stubEnv("ZOHO_CLIENT_ID", "");
    vi.stubEnv("ZOHO_CLIENT_SECRET", "");
    vi.stubEnv("ZOHO_REDIRECT_URI", "");
    vi.stubEnv("ZOHO_DATA_CENTER", "");
    expect(() => getZohoOAuthConfig()).toThrow(ZohoConfigurationError);
    expect(isZohoConfigured()).toBe(false);
  });

  it("rejects an unrecognized data center", () => {
    vi.stubEnv("ZOHO_CLIENT_ID", "id");
    vi.stubEnv("ZOHO_CLIENT_SECRET", "secret");
    vi.stubEnv("ZOHO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("ZOHO_DATA_CENTER", "xx");
    expect(() => getZohoOAuthConfig()).toThrow(ZohoConfigurationError);
  });

  it("returns a valid config when everything is set correctly", () => {
    vi.stubEnv("ZOHO_CLIENT_ID", "id");
    vi.stubEnv("ZOHO_CLIENT_SECRET", "secret");
    vi.stubEnv("ZOHO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("ZOHO_DATA_CENTER", "in");
    const config = getZohoOAuthConfig();
    expect(config.dataCenter).toBe("in");
    expect(isZohoConfigured()).toBe(true);
  });
});

describe("buildAuthorizationUrl", () => {
  it("targets the configured data center and includes required params, never the client secret", () => {
    const url = buildAuthorizationUrl(
      {
        clientId: "abc123",
        clientSecret: "super-secret",
        redirectUri: "https://app.example.com/cb",
        dataCenter: "in",
      },
      "nonce-value",
    );
    expect(url).toContain("https://accounts.zoho.in/oauth/v2/auth");
    expect(url).toContain("client_id=abc123");
    expect(url).toContain("state=nonce-value");
    expect(url).toContain("access_type=offline");
    expect(url).not.toContain("super-secret");
  });

  it("requests exactly the approved least-privilege READ-only scope set — no more, no less", () => {
    const url = buildAuthorizationUrl(
      {
        clientId: "abc123",
        clientSecret: "super-secret",
        redirectUri: "https://app.example.com/cb",
        dataCenter: "in",
      },
      "nonce-value",
    );
    const requestedScope = new URL(url).searchParams.get("scope");
    expect(requestedScope).not.toBeNull();
    const requestedScopes = requestedScope!.split(",");

    expect(requestedScopes).toEqual([...ZOHO_INVENTORY_OAUTH_SCOPES]);
    expect(requestedScopes).toHaveLength(6);
  });

  it("never requests fullaccess or any CREATE/UPDATE/DELETE scope (Phase 1 is read-only)", () => {
    const url = buildAuthorizationUrl(
      {
        clientId: "abc123",
        clientSecret: "super-secret",
        redirectUri: "https://app.example.com/cb",
        dataCenter: "in",
      },
      "nonce-value",
    );
    const requestedScope = new URL(url).searchParams.get("scope")!;

    expect(requestedScope).not.toMatch(/fullaccess/i);
    expect(requestedScope).not.toMatch(/\.(CREATE|UPDATE|DELETE|ALL)\b/);
    for (const scope of requestedScope.split(",")) {
      expect(scope).toMatch(/^ZohoInventory\.[a-z]+\.READ$/);
    }
  });

  it("requests read access to every Phase 1 entity's backing Zoho module", () => {
    const url = buildAuthorizationUrl(
      {
        clientId: "abc123",
        clientSecret: "super-secret",
        redirectUri: "https://app.example.com/cb",
        dataCenter: "in",
      },
      "nonce-value",
    );
    const requestedScopes = new URL(url).searchParams.get("scope")!.split(",");

    // Items (and Stock, which reuses the Items endpoint)
    expect(requestedScopes).toContain("ZohoInventory.items.READ");
    // Vendors (Contacts, filtered by contact_type=vendor)
    expect(requestedScopes).toContain("ZohoInventory.contacts.READ");
    expect(requestedScopes).toContain("ZohoInventory.warehouses.READ");
    expect(requestedScopes).toContain("ZohoInventory.purchaseorders.READ");
    expect(requestedScopes).toContain("ZohoInventory.purchasereceives.READ");
    expect(requestedScopes).toContain("ZohoInventory.salesorders.READ");
  });
});

describe("exchangeCodeForTokens / refreshAccessToken (mocked fetch)", () => {
  const config = {
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "https://x/cb",
    dataCenter: "com" as const,
  };

  it("parses a valid token response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: "at-1",
        refresh_token: "rt-1",
        api_domain: "https://www.zohoapis.com",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    );
    const tokens = await exchangeCodeForTokens(
      config,
      "auth-code",
      fetchMock as unknown as typeof fetch,
    );
    expect(tokens.access_token).toBe("at-1");
    expect(tokens.refresh_token).toBe("rt-1");
  });

  it("throws ZohoAuthenticationError on a non-OK response", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: "invalid_code" }), { status: 400 }),
    );
    await expect(
      exchangeCodeForTokens(config, "bad-code", fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ZohoAuthenticationError);
  });

  it("throws ZohoMalformedResponseError when the shape is unexpected", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ unexpected: true }));
    await expect(
      exchangeCodeForTokens(config, "code", fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ZohoMalformedResponseError);
  });

  it("throws ZohoNetworkError when fetch itself fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      exchangeCodeForTokens(config, "code", fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ZohoNetworkError);
  });

  it("refreshAccessToken posts grant_type=refresh_token and never logs the secret in a thrown message", async () => {
    let capturedUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({
        access_token: "at-2",
        api_domain: "https://www.zohoapis.com",
        token_type: "Bearer",
        expires_in: 3600,
      });
    });
    const tokens = await refreshAccessToken(
      config,
      "refresh-token-value",
      fetchMock as unknown as typeof fetch,
    );
    expect(tokens.access_token).toBe("at-2");
    expect(capturedUrl).toContain("grant_type=refresh_token");
    expect(capturedUrl).toContain("refresh_token=refresh-token-value");
  });
});

describe("revokeRefreshToken", () => {
  const config = {
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "https://x/cb",
    dataCenter: "com" as const,
  };

  it("returns true on a successful revoke", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(
      revokeRefreshToken(config, "rt", fetchMock as unknown as typeof fetch),
    ).resolves.toBe(true);
  });

  it("never throws even when the network call fails (best-effort)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      revokeRefreshToken(config, "rt", fetchMock as unknown as typeof fetch),
    ).resolves.toBe(false);
  });
});
