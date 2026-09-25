import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/zoho/auth/encryption";

describe("Zoho token encryption (AES-256-GCM)", () => {
  it("round-trips a secret", () => {
    const encrypted = encryptSecret("1000.abcdef1234567890.refresh-token-value");
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptSecret(encrypted)).toBe("1000.abcdef1234567890.refresh-token-value");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-value");
    expect(decryptSecret(b)).toBe("same-value");
  });

  it("round-trips an empty string", () => {
    const encrypted = encryptSecret("");
    expect(decryptSecret(encrypted)).toBe("");
  });

  it("rejects a tampered ciphertext (GCM auth tag mismatch)", () => {
    const encrypted = encryptSecret("some-secret-token");
    const [iv, tag, data] = encrypted.split(".");
    const tamperedDataByte = Buffer.from(data!, "base64");
    tamperedDataByte[0] = (tamperedDataByte[0]! ^ 0xff) & 0xff;
    const tampered = [iv, tag, tamperedDataByte.toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptSecret("not-a-valid-encoded-value")).toThrow();
  });
});
