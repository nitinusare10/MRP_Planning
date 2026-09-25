import { describe, it, expect, vi, afterEach } from "vitest";
import { createOAuthState, verifyOAuthState } from "@/lib/zoho/auth/state";
import { ZohoOAuthStateError } from "@/lib/zoho/errors";

describe("OAuth state (CSRF protection)", () => {
  afterEach(() => vi.useRealTimers());

  it("verifies a freshly created state token against its own nonce", () => {
    const { token, nonce } = createOAuthState("60012345678");
    const payload = verifyOAuthState(token, nonce);
    expect(payload.organizationId).toBe("60012345678");
    expect(payload.nonce).toBe(nonce);
  });

  it("rejects a missing cookie token", () => {
    expect(() => verifyOAuthState(undefined, "some-nonce")).toThrow(ZohoOAuthStateError);
  });

  it("rejects a missing query state param", () => {
    const { token } = createOAuthState("org-1");
    expect(() => verifyOAuthState(token, undefined)).toThrow(ZohoOAuthStateError);
  });

  it("rejects a mismatched nonce (possible CSRF)", () => {
    const { token } = createOAuthState("org-1");
    expect(() => verifyOAuthState(token, "attacker-supplied-nonce")).toThrow(ZohoOAuthStateError);
  });

  it("rejects a tampered signature", () => {
    const { token } = createOAuthState("org-1");
    const [payload] = token.split(".");
    const tampered = `${payload}.forged-signature`;
    const nonce = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")).nonce as string;
    expect(() => verifyOAuthState(tampered, nonce)).toThrow(ZohoOAuthStateError);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { token, nonce } = createOAuthState("org-1");

    vi.setSystemTime(new Date("2026-01-01T00:15:00Z")); // 15 minutes later, past the 10-minute TTL
    expect(() => verifyOAuthState(token, nonce)).toThrow(ZohoOAuthStateError);
  });
});
