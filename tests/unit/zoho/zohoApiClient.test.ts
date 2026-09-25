import { describe, it, expect, vi } from "vitest";
import { createZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import {
  ZohoAuthenticationError,
  ZohoAuthorizationError,
  ZohoMalformedResponseError,
  ZohoNetworkError,
  ZohoRateLimitError,
  ZohoRequestError,
  ZohoServerError,
  ZohoTimeoutError,
} from "@/lib/zoho/errors";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function baseDeps(
  fetchImpl: typeof fetch,
  overrides: Partial<Parameters<typeof createZohoApiClient>[0]> = {},
) {
  return {
    apiBaseUrl: "https://www.zohoapis.in",
    organizationId: "org-123",
    getAccessToken: vi.fn(async () => "token-v1"),
    refreshAccessToken: vi.fn(async () => "token-v2"),
    fetchImpl,
    maxRetries: 2,
    backoffBaseMs: 1,
    ...overrides,
  };
}

describe("Zoho API client", () => {
  it("returns parsed JSON on a successful first attempt and includes organization_id", async () => {
    let capturedUrl = "";
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ ok: true });
    });
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    const result = await client.request("/items");
    expect(result).toEqual({ ok: true });
    expect(capturedUrl).toContain("organization_id=org-123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the access token as a Zoho-oauthtoken Authorization header", async () => {
    let headers: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      headers = init?.headers;
      return jsonResponse({ ok: true });
    });
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    await client.request("/items");
    expect((headers as Record<string, string>).Authorization).toBe("Zoho-oauthtoken token-v1");
  });

  it("retries on 5xx and eventually succeeds", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 3 ? jsonResponse({ error: "boom" }, 500) : jsonResponse({ ok: true });
    });
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    const result = await client.request("/items");
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws ZohoServerError after exhausting retries on persistent 5xx", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "down" }, 503));
    const client = createZohoApiClient(
      baseDeps(fetchImpl as unknown as typeof fetch, { maxRetries: 2 }),
    );
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoServerError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("respects Retry-After on 429 and eventually succeeds", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 2 ? jsonResponse({}, 429, { "Retry-After": "0" }) : jsonResponse({ ok: true });
    });
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    const result = await client.request("/items");
    expect(result).toEqual({ ok: true });
  });

  it("throws ZohoRateLimitError after exhausting retries on persistent 429", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const client = createZohoApiClient(
      baseDeps(fetchImpl as unknown as typeof fetch, { maxRetries: 1 }),
    );
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refreshes the token once on 401 and retries the same request", async () => {
    const seenTokens: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization ?? "";
      seenTokens.push(auth);
      return auth.endsWith("token-v1") ? jsonResponse({}, 401) : jsonResponse({ ok: true });
    });
    const deps = baseDeps(fetchImpl as unknown as typeof fetch);
    const client = createZohoApiClient(deps);
    const result = await client.request("/items");
    expect(result).toEqual({ ok: true });
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(seenTokens).toEqual(["Zoho-oauthtoken token-v1", "Zoho-oauthtoken token-v2"]);
  });

  it("throws ZohoAuthenticationError when 401 persists even after a refresh", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401));
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoAuthenticationError);
    // One request with the original token, one retry with the refreshed token — never more.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws ZohoAuthorizationError on 403 without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 403));
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoAuthorizationError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws ZohoRequestError on a permanent 4xx (e.g. 404) without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    await expect(client.request("/items/missing")).rejects.toBeInstanceOf(ZohoRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a network error and eventually throws ZohoNetworkError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = createZohoApiClient(
      baseDeps(fetchImpl as unknown as typeof fetch, { maxRetries: 2 }),
    );
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws ZohoTimeoutError when every attempt aborts", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });
    const client = createZohoApiClient(
      baseDeps(fetchImpl as unknown as typeof fetch, { maxRetries: 1 }),
    );
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoTimeoutError);
  });

  it("throws ZohoMalformedResponseError when a 200 response isn't valid JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>not json</html>", { status: 200 }));
    const client = createZohoApiClient(baseDeps(fetchImpl as unknown as typeof fetch));
    await expect(client.request("/items")).rejects.toBeInstanceOf(ZohoMalformedResponseError);
  });
});
