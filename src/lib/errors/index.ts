import { ZodError } from "zod";
import { logger } from "@/lib/logging";

/**
 * Base class for errors that are safe to translate directly into an HTTP
 * response (expected/handled failures). Anything that isn't an AppError is
 * treated as a bug and never has its message exposed to the client.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
  readonly status = 400;
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly status = 401;

  constructor(message = "Authentication is required.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(message = "The requested resource was not found.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT";
  readonly status = 409;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Normalizes any thrown value into a safe, consistent API error body plus the
 * HTTP status to send. Unexpected (non-AppError) errors are logged with full
 * detail server-side but never leak their message to the client.
 */
export function toApiError(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: err.flatten(),
        },
      },
    };
  }

  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }

  logger.error({ err }, "Unhandled error");
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
  };
}
