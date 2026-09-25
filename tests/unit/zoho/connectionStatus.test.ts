import { describe, it, expect } from "vitest";
import { toConnectionStatus } from "@/lib/zoho/auth/connection";
import type { ZohoConnection } from "@/generated/prisma/client";

describe("toConnectionStatus — never leaks token material (requirement #27)", () => {
  it("returns null-ish status when there is no connection", () => {
    const status = toConnectionStatus(null);
    expect(status.connected).toBe(false);
    expect(status).not.toHaveProperty("accessTokenEncrypted");
  });

  it("omits every token field even though the source row has them", () => {
    const fakeConnection = {
      id: "conn-1",
      zohoOrganizationId: "org-1",
      accessTokenEncrypted: "iv.tag.super-secret-ciphertext",
      refreshTokenEncrypted: "iv.tag.super-secret-refresh-ciphertext",
      tokenExpiresAt: new Date(),
      scope: "ZohoInventory.fullaccess.all",
      apiDomain: "https://www.zohoapis.in",
      connectedById: "user-1",
      connectedAt: new Date(),
      lastRefreshedAt: null,
      status: "CONNECTED",
    } as unknown as ZohoConnection;

    const status = toConnectionStatus(fakeConnection);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("super-secret-ciphertext");
    expect(serialized).not.toContain("super-secret-refresh-ciphertext");
    expect(status.connected).toBe(true);
    expect(status.zohoOrganizationId).toBe("org-1");
  });
});
