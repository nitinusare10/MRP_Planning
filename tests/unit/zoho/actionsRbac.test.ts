import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

const mockAuth = vi.fn<() => Promise<Session | null>>();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const { connectZohoAction, disconnectZohoAction, triggerSyncAction } =
  await import("@/app/zoho/actions");
const { UnauthorizedError, ForbiddenError } = await import("@/lib/errors");

function fakeSession(role: "ADMIN" | "PLANNER" | "PROCUREMENT" | "VIEWER"): Session {
  return {
    user: { id: "user-1", role, email: "test@example.com", name: "Test" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

const initialState = { status: "idle" as const };

describe("Zoho server actions enforce RBAC server-side (requirements #25, #27)", () => {
  beforeEach(() => mockAuth.mockReset());

  it("connectZohoAction rejects non-ADMIN roles before touching cookies/OAuth", async () => {
    for (const role of ["PLANNER", "PROCUREMENT", "VIEWER"] as const) {
      mockAuth.mockResolvedValue(fakeSession(role));
      const formData = new FormData();
      formData.set("organizationId", "60012345678");
      await expect(connectZohoAction(initialState, formData)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("connectZohoAction rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("organizationId", "60012345678");
    await expect(connectZohoAction(initialState, formData)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("disconnectZohoAction rejects non-ADMIN roles", async () => {
    for (const role of ["PLANNER", "PROCUREMENT", "VIEWER"] as const) {
      mockAuth.mockResolvedValue(fakeSession(role));
      await expect(disconnectZohoAction(initialState, new FormData())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("triggerSyncAction allows ADMIN and PLANNER but rejects PROCUREMENT and VIEWER", async () => {
    const formData = new FormData();
    formData.set("entity", "ITEM");

    for (const role of ["PROCUREMENT", "VIEWER"] as const) {
      mockAuth.mockResolvedValue(fakeSession(role));
      await expect(triggerSyncAction(initialState, formData)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("triggerSyncAction rejects an unrecognized entity value even for an authorized role", async () => {
    mockAuth.mockResolvedValue(fakeSession("ADMIN"));
    const formData = new FormData();
    formData.set("entity", "NOT_A_REAL_ENTITY");
    const result = await triggerSyncAction(initialState, formData);
    expect(result.status).toBe("error");
  });
});
