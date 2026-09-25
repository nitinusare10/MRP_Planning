import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { syncItems } from "@/lib/zoho/sync/items";
import { createFakeZohoClient, uniqueSuffix, cleanupZohoTestData } from "./helpers";
import { ZohoAuthenticationError } from "@/lib/zoho/errors";

describe("SyncLog never stores secrets (requirement #27)", () => {
  const createdSyncLogs: string[] = [];

  afterEach(async () => {
    await cleanupZohoTestData({ syncLog: createdSyncLogs.splice(0) });
  });

  it("redacts a token-shaped value out of a fatal error message before storing it", async () => {
    const secretToken = `super-secret-access-token-${uniqueSuffix()}`;
    const client = createFakeZohoClient(() => {
      throw new ZohoAuthenticationError(`Zoho rejected access_token=${secretToken}`);
    });

    const run = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run.syncLogId);
    expect(run.status).toBe("FAILED");

    const log = await prisma.syncLog.findUniqueOrThrow({ where: { id: run.syncLogId } });
    expect(log.errorDetails).not.toContain(secretToken);
    expect(log.errorDetails).toContain("[REDACTED]");
  });

  it("per-record validation failures are recorded without ever containing the raw Authorization header", async () => {
    const client = createFakeZohoClient(() => ({
      items: [{ not_a_valid_item: true }],
      page_context: { has_more_page: false },
    }));
    const run = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run.syncLogId);
    expect(run.failed).toBe(1);

    const log = await prisma.syncLog.findUniqueOrThrow({ where: { id: run.syncLogId } });
    expect(log.errorDetails ?? "").not.toMatch(/Zoho-oauthtoken|Bearer\s+\S+/i);
  });
});
