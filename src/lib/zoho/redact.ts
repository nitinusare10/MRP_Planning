/**
 * Defense-in-depth text redaction for anything that might end up in a
 * SyncLog.errorDetails string or a log line. The structured logger
 * (lib/logging) already redacts known object keys; this additionally scrubs
 * secret-shaped substrings out of free-form error message text, in case a
 * thrown error's message ever accidentally embeds one.
 */
const SECRET_KEY_PATTERN =
  /(access_token|refresh_token|client_secret|zoho-oauthtoken)\s*[:=]\s*\S+/gi;
const BEARER_PATTERN = /(Bearer|Zoho-oauthtoken)\s+\S+/gi;

export function redactSecrets(input: string): string {
  return input
    .replace(SECRET_KEY_PATTERN, "$1=[REDACTED]")
    .replace(BEARER_PATTERN, "$1 [REDACTED]");
}

export function safeErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactSecrets(message);
}
