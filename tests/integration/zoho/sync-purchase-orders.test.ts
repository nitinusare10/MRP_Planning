import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { syncItems } from "@/lib/zoho/sync/items";
import { syncVendors } from "@/lib/zoho/sync/vendors";
import { syncPurchaseOrders } from "@/lib/zoho/sync/purchaseOrders";
import { createFakeZohoClient, listEnvelope, uniqueSuffix, cleanupZohoTestData } from "./helpers";

describe("syncPurchaseOrders — FK resolution, detail-fetch, usableForMrp (requirements #16, #17)", () => {
  const createdItems: string[] = [];
  const createdVendors: string[] = [];
  const createdPOs: string[] = [];
  const createdPOLines: string[] = [];
  const createdSyncLogs: string[] = [];

  afterEach(async () => {
    await cleanupZohoTestData({
      purchaseOrderLine: createdPOLines.splice(0),
      purchaseOrder: createdPOs.splice(0),
      item: createdItems.splice(0),
      vendor: createdVendors.splice(0),
      syncLog: createdSyncLogs.splice(0),
    });
  });

  it("resolves vendor/item by Zoho ID, computes usableForMrp, and is idempotent across two runs", async () => {
    const suffix = uniqueSuffix();
    const zohoItemId = `poi-${suffix}`;
    const zohoVendorId = `pov-${suffix}`;
    const zohoPoId = `po-${suffix}`;
    const zohoLineId = `pol-${suffix}`;

    // Seed the master data this PO depends on, exactly as syncAll's ordering does.
    const itemClient = createFakeZohoClient((path) =>
      path === "/items"
        ? listEnvelope("items", [{ item_id: zohoItemId, name: "Item", unit: "pcs" }])
        : null,
    );
    const itemRun = await syncItems({ triggerType: "MANUAL", client: itemClient });
    createdSyncLogs.push(itemRun.syncLogId);
    const item = await prisma.item.findUniqueOrThrow({ where: { zohoItemId } });
    createdItems.push(item.id);

    const vendorClient = createFakeZohoClient((path) =>
      path === "/contacts"
        ? listEnvelope("contacts", [{ contact_id: zohoVendorId, contact_name: "Vendor Co" }])
        : null,
    );
    const vendorRun = await syncVendors({ triggerType: "MANUAL", client: vendorClient });
    createdSyncLogs.push(vendorRun.syncLogId);
    const vendor = await prisma.vendor.findUniqueOrThrow({ where: { zohoVendorId } });
    createdVendors.push(vendor.id);

    const orderedQty = 100;
    let receivedQty = 40;
    let status = "issued";
    const poClient = createFakeZohoClient((path) => {
      if (path === "/purchaseorders") {
        return listEnvelope("purchaseorders", [
          {
            purchaseorder_id: zohoPoId,
            purchaseorder_number: "PO-1",
            vendor_id: zohoVendorId,
            status,
            date: "2026-09-01",
          },
        ]);
      }
      if (path === `/purchaseorders/${zohoPoId}`) {
        return {
          purchaseorder: {
            purchaseorder_id: zohoPoId,
            purchaseorder_number: "PO-1",
            vendor_id: zohoVendorId,
            status,
            date: "2026-09-01",
            line_items: [
              {
                line_item_id: zohoLineId,
                item_id: zohoItemId,
                quantity: orderedQty,
                quantity_received: receivedQty,
              },
            ],
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const run1 = await syncPurchaseOrders({ triggerType: "MANUAL", client: poClient });
    createdSyncLogs.push(run1.syncLogId);
    expect(run1.status).toBe("SUCCESS");
    expect(run1.created).toBe(1);

    const po1 = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { zohoPoId },
      include: { lines: true },
    });
    createdPOs.push(po1.id);
    po1.lines.forEach((l) => createdPOLines.push(l.id));
    expect(po1.vendorId).toBe(vendor.id);
    expect(po1.lines).toHaveLength(1);
    expect(po1.lines[0]!.itemId).toBe(item.id);
    expect(po1.lines[0]!.pendingQuantity.toString()).toBe("60");
    expect(po1.lines[0]!.usableForMrp).toBe(true); // issued + pending>0

    // Re-sync with identical data: idempotent, no duplicate PO or line.
    const run2 = await syncPurchaseOrders({ triggerType: "MANUAL", client: poClient });
    createdSyncLogs.push(run2.syncLogId);
    expect(run2.created).toBe(0);
    expect(run2.updated).toBe(1);
    const countAfter = await prisma.purchaseOrder.count({ where: { zohoPoId } });
    expect(countAfter).toBe(1);
    const lineCountAfter = await prisma.purchaseOrderLine.count({
      where: { zohoPoLineId: zohoLineId },
    });
    expect(lineCountAfter).toBe(1);

    // The order gets fully received and closed — usableForMrp must flip to false.
    receivedQty = 100;
    status = "closed";
    const run3 = await syncPurchaseOrders({ triggerType: "MANUAL", client: poClient });
    createdSyncLogs.push(run3.syncLogId);
    const line = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { zohoPoLineId: zohoLineId },
    });
    expect(line.pendingQuantity.toString()).toBe("0");
    expect(line.usableForMrp).toBe(false);
  });

  it("skips (never crashes) a PO whose vendor hasn't been synced yet, and records why", async () => {
    const suffix = uniqueSuffix();
    const zohoPoId = `po-orphan-${suffix}`;
    const unknownVendorId = `unknown-vendor-${suffix}`;

    const client = createFakeZohoClient((path) => {
      if (path === "/purchaseorders") {
        return listEnvelope("purchaseorders", [
          {
            purchaseorder_id: zohoPoId,
            purchaseorder_number: "PO-X",
            vendor_id: unknownVendorId,
            status: "issued",
            date: "2026-09-01",
          },
        ]);
      }
      if (path === `/purchaseorders/${zohoPoId}`) {
        return {
          purchaseorder: {
            purchaseorder_id: zohoPoId,
            purchaseorder_number: "PO-X",
            vendor_id: unknownVendorId,
            status: "issued",
            date: "2026-09-01",
            line_items: [],
          },
        };
      }
      throw new Error("unexpected path");
    });

    const run = await syncPurchaseOrders({ triggerType: "MANUAL", client });
    createdSyncLogs.push(run.syncLogId);
    expect(run.status).toBe("PARTIAL_SUCCESS");
    expect(run.failed).toBe(1);

    const po = await prisma.purchaseOrder.findUnique({ where: { zohoPoId } });
    expect(po).toBeNull(); // never created — no dangling/garbage row

    const syncLog = await prisma.syncLog.findUniqueOrThrow({ where: { id: run.syncLogId } });
    expect(syncLog.errorDetails).toContain(unknownVendorId);
  });
});
