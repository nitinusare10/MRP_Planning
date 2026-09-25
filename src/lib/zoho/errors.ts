import { AppError } from "@/lib/errors";

/**
 * Transport-layer errors from the Zoho API client. These are caught inside
 * the sync engine (never surfaced raw to the browser) and decide retry
 * behavior; `retryable` is read by the client's retry loop.
 */
export abstract class ZohoApiError extends Error {
  abstract readonly retryable: boolean;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401 that survived a token refresh attempt — the connection needs re-auth. */
export class ZohoAuthenticationError extends ZohoApiError {
  readonly retryable = false;
}

/** 403 — the connected account/scope doesn't permit this call. */
export class ZohoAuthorizationError extends ZohoApiError {
  readonly retryable = false;
}

/** 429 — Zoho's rate limit. Retryable with backoff, bounded. */
export class ZohoRateLimitError extends ZohoApiError {
  readonly retryable = true;
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export class ZohoTimeoutError extends ZohoApiError {
  readonly retryable = true;
}

/** DNS/connection-reset/etc — never a response, so no status code available. */
export class ZohoNetworkError extends ZohoApiError {
  readonly retryable = true;
}

/** 5xx from Zoho. */
export class ZohoServerError extends ZohoApiError {
  readonly retryable = true;
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 4xx (other than 401/403/429) — a permanent request problem, never retried. */
export class ZohoRequestError extends ZohoApiError {
  readonly retryable = false;
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The response didn't match the shape our Zod schema expects. */
export class ZohoMalformedResponseError extends ZohoApiError {
  readonly retryable = false;
}

// ── Application-facing errors (extend the project's AppError, safe to throw
//    from server actions / route handlers and pass through toApiError()) ──

export class ZohoNotConnectedError extends AppError {
  readonly code = "ZOHO_NOT_CONNECTED";
  readonly status = 409;

  constructor(message = "Zoho Inventory is not connected.") {
    super(message);
  }
}

export class ZohoConnectionInvalidError extends AppError {
  readonly code = "ZOHO_CONNECTION_INVALID";
  readonly status = 409;

  constructor(message = "The Zoho connection is expired or revoked and needs to be reconnected.") {
    super(message);
  }
}

export class ZohoConfigurationError extends AppError {
  readonly code = "ZOHO_CONFIGURATION_ERROR";
  readonly status = 500;
}

export class ZohoOAuthStateError extends AppError {
  readonly code = "ZOHO_OAUTH_STATE_INVALID";
  readonly status = 400;

  constructor(message = "The OAuth callback could not be verified. Please try connecting again.") {
    super(message);
  }
}
