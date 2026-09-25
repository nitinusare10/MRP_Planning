import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ZohoConfigurationError } from "@/lib/zoho/errors";

/**
 * Application-level encryption for Zoho tokens at rest (ZohoConnection
 * .accessTokenEncrypted / .refreshTokenEncrypted). AES-256-GCM: a random
 * 96-bit IV per value, authenticated (tamper-evident) ciphertext.
 *
 * ZOHO_ENCRYPTION_KEY must be a base64-encoded 32-byte (256-bit) key,
 * e.g. `openssl rand -base64 32`. It is read from the environment only —
 * never hard-coded, never logged.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.ZOHO_ENCRYPTION_KEY;
  if (!raw) {
    throw new ZohoConfigurationError(
      "ZOHO_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new ZohoConfigurationError(
      "ZOHO_ENCRYPTION_KEY must decode to exactly 32 bytes (a base64-encoded AES-256 key).",
    );
  }
  return key;
}

/** Encrypts a secret for storage. Output format: `<iv>.<authTag>.<ciphertext>`, all base64. */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ".",
  );
}

/** Decrypts a value produced by encryptSecret(). Throws if tampered or malformed. */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new ZohoConfigurationError("Stored Zoho secret is malformed and cannot be decrypted.");
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
