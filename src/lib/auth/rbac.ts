import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * Server-side session lookup. Always call this (or requireRole) inside
 * Server Actions and Route Handlers before performing a mutation or
 * returning sensitive data — the frontend's own checks are UX only and are
 * never the security boundary.
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthorizedError();
  }
  return session;
}

/**
 * Requires an authenticated session whose role is one of `allowedRoles`.
 * Throws UnauthorizedError (not logged in) or ForbiddenError (wrong role).
 *
 * Usage: `const session = await requireRole(["ADMIN", "PLANNER"]);`
 */
export async function requireRole(allowedRoles: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!allowedRoles.includes(session.user.role)) {
    throw new ForbiddenError(
      `This action requires one of the following roles: ${allowedRoles.join(", ")}.`,
    );
  }
  return session;
}
