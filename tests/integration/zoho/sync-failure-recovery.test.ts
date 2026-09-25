import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { syncItems } from "@/lib/zoho/sync/items";
import { createFakeZohoClient, listEnvelope, uniqueSuffix, cleanupZohoTestData } from "./helpers";

describe("Sync failure recovery — resumability without corruption (requirement #12)", () => {
  const createdItems: string[] = [];
  const createdSyncLogs: string[] = [];

  afterEach(async () => {
    await cleanupZohoTestData({ item: createdItems.splice(0), syncLog: createdSyncLogs.splice(0) });
  });

  it("page 3 failing leaves pages 1-2 committed and marks the run FAILED; re-running is safe and completes cleanly", async () => {
    const suffix = uniqueSuffix();
    const ids = [1, 2, 3].map((n) => `zf-${suffix}-${n}`);
    let shouldFailOnPage3 = true;

    const client = createFakeZohoClient((path, query) => {
      if (path !== "/items") throw new Error("unexpected path");
      const page = Number(query?.page ?? 1);
      if (page === 1)
        return listEnvelope("items", [{ item_id: ids[0], name: "Item 1", unit: "pcs" }], true);
      if (page === 2)
        return listEnvelope("items", [{ item_id: ids[1], name: "Item 2", unit: "pcs" }], true);
      if (page === 3) {
        if (shouldFailOnPage3) throw new Error("simulated network failure on page 3");
        return listEnvelope("items", [{ item_id: ids[2], name: "Item 3", unit: "pcs" }], false);
      }
      throw new Error("unexpected page");
    });

    const failedRun = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(failedRun.syncLogId);
    expect(failedRun.status).toBe("FAILED");
    // Pages 1 and 2 were fully processed and committed before the failure.
    expect(failedRun.created).toBe(2);

    const afterFailure = await prisma.item.findMany({ where: { zohoItemId: { in: ids } } });
    afterFailure.forEach((i) => createdItems.push(i.id));
    expect(afterFailure.map((i) => i.zohoItemId).sort()).toEqual([ids[0], ids[1]].sort());

    const failedLog = await prisma.syncLog.findUniqueOrThrow({
      where: { id: failedRun.syncLogId },
    });
    expect(failedLog.lastPageCursor).toBe("2"); // observability: got through page 2
    expect(failedLog.errorDetails).toContain("simulated network failure");

    // Re-run after the transient failure clears. Pages 1-2 re-upsert to the
    // same values (no duplicates); page 3 finally lands.
    shouldFailOnPage3 = false;
    const recoveredRun = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(recoveredRun.syncLogId);
    expect(recoveredRun.status).toBe("SUCCESS");
    expect(recoveredRun.created).toBe(1); // only item 3 is new this time
    expect(recoveredRun.updated).toBe(2); // items 1-2 already existed

    const finalItems = await prisma.item.findMany({ where: { zohoItemId: { in: ids } } });
    expect(finalItems).toHaveLength(3); // exactly 3 — never duplicated, never lost
  });
});
