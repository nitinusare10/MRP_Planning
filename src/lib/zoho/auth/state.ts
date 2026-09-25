import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ZohoConfigurationError, ZohoOAuthStateError } from "@/lib/zoho/errors";

/**
 * Signed, short-lived OAuth `state` payload — CSRF protection for the
 * authorization-code flow. Carries the admin-entered Zoho organization ID
 * across the redirect round trip without trusting anything the browser
 * sends back unverified. Signed with AUTH_SECRET (already a strong,
 * server-only random secret used for session JWTs) via HMAC-SHA256, scoped
 * by a distinct context label so it can never be confused with a session
 * token even if compared byte-for-byte.
 */

const CONTEXT = "zoho-oauth-state:v1";
const TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to complete the Zoho consent screen

export interface OAuthStatePayload {
  nonce: string;
  organizationId: string;
  exp: number;
}

function getSigningKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new ZohoConfigurationError(
      "AUTH_SECRET is not set; cannot sign the OAuth state parameter.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(`${CONTEXT}:${payload}`).digest("base64url");
}

/** Creates a signed state token to store in an httpOnly cookie before redirecting to Zoho. */
export function createOAuthState(organizationId: string): { token: string; nonce: string } {
  const payload: OAuthStatePayload = {
    nonce: randomBytes(16).toString("base64url"),
    organizationId,
    exp: Date.now() + TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload);
  return { token: `${encodedPayload}.${signature}`, nonce: payload.nonce };
}

/**
 * Verifies a state token read back from the cookie against the `state`
 * query param Zoho echoed back. Throws ZohoOAuthStateError on any mismatch,
 * tampering, or expiry — never silently falls back to "trust it anyway."
 */
export function verifyOAuthState(
  cookieToken: string | undefined,
  queryStateParam: string | undefined,
): OAuthStatePayload {
  if (!cookieToken || !queryStateParam) {
    throw new ZohoOAuthStateError(
      "Missing OAuth state — the connection attempt may have expired. Please try again.",
    );
  }

  const [encodedPayload, signature] = cookieToken.split(".");
  if (!encodedPayload || !signature) {
    throw new ZohoOAuthStateError();
  }

  const expectedSignature = sign(encodedPayload);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    throw new ZohoOAuthStateError("OAuth state signature is invalid.");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    throw new ZohoOAuthStateError("OAuth state payload is malformed.");
  }

  if (Date.now() > payload.exp) {
    throw new ZohoOAuthStateError("OAuth state has expired. Please try connecting again.");
  }

  if (payload.nonce !== queryStateParam) {
    throw new ZohoOAuthStateError("OAuth state does not match — possible CSRF attempt.");
  }

  return payload;
}
