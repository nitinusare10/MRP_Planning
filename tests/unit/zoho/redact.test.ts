import { describe, it, expect } from "vitest";
import { redactSecrets, safeErrorMessage } from "@/lib/zoho/redact";

describe("secret redaction", () => {
  it("scrubs key=value style token mentions", () => {
    const input = "Token exchange failed: access_token=abc123XYZ was rejected";
    expect(redactSecrets(input)).not.toContain("abc123XYZ");
    expect(redactSecrets(input)).toContain("[REDACTED]");
  });

  it("scrubs Bearer/Zoho-oauthtoken header-shaped mentions", () => {
    expect(redactSecrets("Authorization: Zoho-oauthtoken 1000.super.secret.value")).not.toContain(
      "1000.super.secret.value",
    );
    expect(redactSecrets("Authorization: Bearer abcdef")).not.toContain("abcdef");
  });

  it("leaves ordinary error text untouched", () => {
    const input = "Zoho API returned HTTP 500 for /items after 3 retries.";
    expect(redactSecrets(input)).toBe(input);
  });

  it("safeErrorMessage redacts an Error's message", () => {
    const err = new Error("refresh_token=super-secret-value could not be used");
    expect(safeErrorMessage(err)).not.toContain("super-secret-value");
  });

  it("safeErrorMessage handles non-Error thrown values", () => {
    expect(safeErrorMessage("plain string error")).toBe("plain string error");
  });
});
