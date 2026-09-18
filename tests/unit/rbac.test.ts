import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

const mockAuth = vi.fn<() => Promise<Session | null>>();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const { requireRole, requireSession } = await import("@/lib/auth/rbac");
const { UnauthorizedError, ForbiddenError } = await import("@/lib/errors");

function fakeSession(role: "ADMIN" | "PLANNER" | "PROCUREMENT" | "VIEWER"): Session {
  return {
    user: { id: "user-1", role, email: "test@example.com", name: "Test" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("requireSession / requireRole (server-side RBAC)", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("throws UnauthorizedError when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns the session when authenticated", async () => {
    mockAuth.mockResolvedValue(fakeSession("PLANNER"));
    const session = await requireSession();
    expect(session.user.role).toBe("PLANNER");
  });

  it("throws ForbiddenError when the role is not allowed", async () => {
    mockAuth.mockResolvedValue(fakeSession("VIEWER"));
    await expect(requireRole(["ADMIN", "PLANNER"])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows access when the role is in the allowed list", async () => {
    mockAuth.mockResolvedValue(fakeSession("ADMIN"));
    const session = await requireRole(["ADMIN", "PLANNER"]);
    expect(session.user.role).toBe("ADMIN");
  });

  it("throws UnauthorizedError (not ForbiddenError) when unauthenticated, even for role checks", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireRole(["ADMIN"])).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
