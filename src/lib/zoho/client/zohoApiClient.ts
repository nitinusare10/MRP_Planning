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
import { logger } from "@/lib/logging";

type FetchLike = typeof fetch;
type QueryValue = string | number | boolean | undefined;

export interface ZohoClientDeps {
  apiBaseUrl: string;
  organizationId: string;
  /** Returns the current cached access token (no network call). */
  getAccessToken: () => Promise<string>;
  /** Forces a token refresh and returns the new access token. */
  refreshAccessToken: () => Promise<string>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  /** Base delay for exponential backoff; exposed so tests can keep this fast. */
  backoffBaseMs?: number;
}

export interface ZohoRequestOptions {
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export interface ZohoApiClient {
  organizationId: string;
  request<T>(path: string, options?: ZohoRequestOptions): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 300;
const MAX_BACKOFF_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, baseMs: number): number {
  const exponential = baseMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

export function createZohoApiClient(deps: ZohoClientDeps): ZohoApiClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffBaseMs = deps.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;

  function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(path, deps.apiBaseUrl);
    url.searchParams.set("organization_id", deps.organizationId);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async function doFetch(
    url: string,
    options: ZohoRequestOptions,
    accessToken: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(path: string, options: ZohoRequestOptions = {}): Promise<T> {
    const url = buildUrl(path, options.query);
    let accessToken = await deps.getAccessToken();
    let usedRefresh = false;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      let response: Response;
      try {
        response = await doFetch(url, options, accessToken);
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (attempt <= maxRetries) {
          logger.warn({ path, attempt, isAbort }, "Zoho API request failed to send; retrying");
          await sleep(backoffDelay(attempt, backoffBaseMs));
          continue;
        }
        if (isAbort)
          throw new ZohoTimeoutError(
            `Zoho API request to ${path} timed out after ${timeoutMs}ms.`,
            err,
          );
        throw new ZohoNetworkError(`Network error calling Zoho API (${path}).`, err);
      }

      // One-shot re-auth: a 401 means the cached token is no longer good
      // (expired mid-run, revoked, etc). Force a refresh and retry the same
      // request once before giving up — this does not consume a retry slot.
      if (response.status === 401 && !usedRefresh) {
        usedRefresh = true;
        logger.info({ path }, "Zoho API returned 401; refreshing access token and retrying once");
        accessToken = await deps.refreshAccessToken();
        continue;
      }

      if (response.status === 401) {
        throw new ZohoAuthenticationError(
          `Zoho API rejected the request as unauthenticated (${path}), even after a token refresh.`,
        );
      }

      if (response.status === 403) {
        throw new ZohoAuthorizationError(`Zoho API denied access to ${path} (403).`);
      }

      if (response.status === 429) {
        if (attempt <= maxRetries) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
          const delay =
            retryAfterMs && Number.isFinite(retryAfterMs)
              ? retryAfterMs
              : backoffDelay(attempt, backoffBaseMs);
          logger.warn({ path, attempt, delay }, "Zoho API rate limit hit; backing off");
          await sleep(delay);
          continue;
        }
        throw new ZohoRateLimitError(
          `Zoho API rate limit exceeded for ${path} after ${maxRetries} retries.`,
        );
      }

      if (response.status >= 500) {
        if (attempt <= maxRetries) {
          logger.warn(
            { path, attempt, status: response.status },
            "Zoho API server error; retrying",
          );
          await sleep(backoffDelay(attempt, backoffBaseMs));
          continue;
        }
        throw new ZohoServerError(
          `Zoho API returned HTTP ${response.status} for ${path} after ${maxRetries} retries.`,
          response.status,
        );
      }

      if (!response.ok) {
        // Any other 4xx (400, 404, 409, ...) is a permanent problem with this
        // specific request — never retried.
        throw new ZohoRequestError(
          `Zoho API returned HTTP ${response.status} for ${path}.`,
          response.status,
        );
      }

      const json: unknown = await response.json().catch(() => null);
      if (json === null) {
        throw new ZohoMalformedResponseError(`Zoho API response for ${path} was not valid JSON.`);
      }
      return json as T;
    }

    // Unreachable in practice (every branch above returns/throws), but keeps
    // TypeScript satisfied and fails loudly rather than resolving undefined.
    throw new ZohoNetworkError(`Zoho API request to ${path} did not complete.`);
  }

  return {
    organizationId: deps.organizationId,
    request,
  };
}
