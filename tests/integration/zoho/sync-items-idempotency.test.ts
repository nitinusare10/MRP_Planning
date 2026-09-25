import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { syncItems } from "@/lib/zoho/sync/items";
import { createFakeZohoClient, listEnvelope, uniqueSuffix, cleanupZohoTestData } from "./helpers";

describe("syncItems — idempotency and MRP-field protection (requirements #10, #13)", () => {
  const createdItems: string[] = [];
  const createdSyncLogs: string[] = [];

  afterEach(async () => {
    await cleanupZohoTestData({ item: createdItems.splice(0), syncLog: createdSyncLogs.splice(0) });
  });

  it("running the same sync 3 times never duplicates rows, and picks up real changes", async () => {
    const suffix = uniqueSuffix();
    const zohoId1 = `zi-${suffix}-1`;
    const zohoId2 = `zi-${suffix}-2`;

    let currentName1 = "MOSFET Original Name";
    const client = createFakeZohoClient((path) => {
      if (path === "/items") {
        return listEnvelope("items", [
          {
            item_id: zohoId1,
            name: currentName1,
            sku: `SKU-${suffix}-1`,
            unit: "pcs",
            status: "active",
          },
          {
            item_id: zohoId2,
            name: "Resistor 10k",
            sku: `SKU-${suffix}-2`,
            unit: "pcs",
            status: "active",
          },
        ]);
      }
      throw new Error(`unexpected path ${path}`);
    });

    // First sync: both items are new.
    const run1 = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run1.syncLogId);
    expect(run1.status).toBe("SUCCESS");
    expect(run1.created).toBe(2);
    expect(run1.updated).toBe(0);

    const afterRun1 = await prisma.item.findMany({
      where: { zohoItemId: { in: [zohoId1, zohoId2] } },
    });
    afterRun1.forEach((i) => createdItems.push(i.id));
    expect(afterRun1).toHaveLength(2);

    // Second identical sync: same 2 logical records — updated, not duplicated.
    const run2 = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run2.syncLogId);
    expect(run2.created).toBe(0);
    expect(run2.updated).toBe(2);

    const afterRun2 = await prisma.item.findMany({
      where: { zohoItemId: { in: [zohoId1, zohoId2] } },
    });
    expect(afterRun2).toHaveLength(2); // still exactly 2, never 4

    // Zoho-side change: item 1's name changes. Third sync must UPDATE the
    // existing row, not create a new one.
    currentName1 = "MOSFET Renamed";
    const run3 = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run3.syncLogId);
    expect(run3.created).toBe(0);
    expect(run3.updated).toBe(2);

    const item1 = await prisma.item.findUnique({ where: { zohoItemId: zohoId1 } });
    expect(item1?.itemName).toBe("MOSFET Renamed");
    const stillOnlyTwo = await prisma.item.count({
      where: { zohoItemId: { in: [zohoId1, zohoId2] } },
    });
    expect(stillOnlyTwo).toBe(2);
  });

  it("never overwrites MRP-owned fields (mrpPlanningStatus/itemClassification/uomType) after a planner sets them", async () => {
    const suffix = uniqueSuffix();
    const zohoId = `zi-${suffix}`;

    const client = createFakeZohoClient((path) =>
      path === "/items"
        ? listEnvelope("items", [
            { item_id: zohoId, name: "Item", sku: `SKU-${suffix}`, unit: "pcs", status: "active" },
          ])
        : (() => {
            throw new Error("unexpected path");
          })(),
    );

    const run1 = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run1.syncLogId);
    const created = await prisma.item.findUniqueOrThrow({ where: { zohoItemId: zohoId } });
    createdItems.push(created.id);
    expect(created.mrpPlanningStatus).toBe("NOT_PLANNED"); // schema default, untouched by sync

    // A planner reviews and classifies the item.
    await prisma.item.update({
      where: { id: created.id },
      data: {
        mrpPlanningStatus: "PLANNED",
        itemClassification: "RAW_MATERIAL",
        uomType: "DISCRETE",
      },
    });

    // Re-sync must not revert the planner's classification.
    const run2 = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run2.syncLogId);
    const afterResync = await prisma.item.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterResync.mrpPlanningStatus).toBe("PLANNED");
    expect(afterResync.itemClassification).toBe("RAW_MATERIAL");
    // But the Zoho-owned name field DOES stay in sync.
    expect(afterResync.itemName).toBe("Item");
  });

  it("walks multiple pages and processes every record", async () => {
    const suffix = uniqueSuffix();
    const page1Id = `zi-${suffix}-p1`;
    const page2Id = `zi-${suffix}-p2`;

    const client = createFakeZohoClient((path, query) => {
      if (path !== "/items") throw new Error("unexpected path");
      const page = Number(query?.page ?? 1);
      if (page === 1) {
        return listEnvelope("items", [{ item_id: page1Id, name: "Page1 Item", unit: "pcs" }], true);
      }
      return listEnvelope("items", [{ item_id: page2Id, name: "Page2 Item", unit: "pcs" }], false);
    });

    const run = await syncItems({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run.syncLogId);
    expect(run.processed).toBe(2);
    expect(run.created).toBe(2);

    const items = await prisma.item.findMany({ where: { zohoItemId: { in: [page1Id, page2Id] } } });
    items.forEach((i) => createdItems.push(i.id));
    expect(items).toHaveLength(2);
  });
});
