import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestItem, createTestVendor, createTestWarehouse, cleanupIds } from "./helpers";

describe("Item/Vendor and Item/Warehouse constraints", () => {
  const createdItems: string[] = [];
  const createdVendors: string[] = [];
  const createdWarehouses: string[] = [];
  const createdItemVendors: string[] = [];
  const createdStockSnapshots: string[] = [];

  afterEach(async () => {
    await cleanupIds({
      itemVendor: createdItemVendors.splice(0),
      stockSnapshot: createdStockSnapshots.splice(0),
      item: createdItems.splice(0),
      vendor: createdVendors.splice(0),
      warehouse: createdWarehouses.splice(0),
    });
  });

  it("rejects a duplicate (itemId, vendorId) sourcing row (requirement #5)", async () => {
    const item = await createTestItem();
    createdItems.push(item.id);
    const vendor = await createTestVendor();
    createdVendors.push(vendor.id);

    const first = await prisma.itemVendor.create({
      data: { itemId: item.id, vendorId: vendor.id },
    });
    createdItemVendors.push(first.id);

    await expect(
      prisma.itemVendor.create({ data: { itemId: item.id, vendorId: vendor.id } }),
    ).rejects.toThrow();
  });

  it("rejects a second active preferred vendor for the same item (requirement #6)", async () => {
    const item = await createTestItem();
    createdItems.push(item.id);
    const vendorA = await createTestVendor();
    createdVendors.push(vendorA.id);
    const vendorB = await createTestVendor();
    createdVendors.push(vendorB.id);

    const first = await prisma.itemVendor.create({
      data: { itemId: item.id, vendorId: vendorA.id, preferred: true, active: true },
    });
    createdItemVendors.push(first.id);

    await expect(
      prisma.itemVendor.create({
        data: { itemId: item.id, vendorId: vendorB.id, preferred: true, active: true },
      }),
    ).rejects.toThrow();
  });

  it("allows a second preferred vendor once the first is inactive", async () => {
    const item = await createTestItem();
    createdItems.push(item.id);
    const vendorA = await createTestVendor();
    createdVendors.push(vendorA.id);
    const vendorB = await createTestVendor();
    createdVendors.push(vendorB.id);

    const first = await prisma.itemVendor.create({
      data: { itemId: item.id, vendorId: vendorA.id, preferred: true, active: false },
    });
    createdItemVendors.push(first.id);

    const second = await prisma.itemVendor.create({
      data: { itemId: item.id, vendorId: vendorB.id, preferred: true, active: true },
    });
    createdItemVendors.push(second.id);

    expect(second.preferred).toBe(true);
  });

  it("rejects a duplicate (itemId, warehouseId) stock snapshot (requirement #7)", async () => {
    const item = await createTestItem();
    createdItems.push(item.id);
    const warehouse = await createTestWarehouse();
    createdWarehouses.push(warehouse.id);

    const first = await prisma.stockSnapshot.create({
      data: { itemId: item.id, warehouseId: warehouse.id, quantityOnHand: 10 },
    });
    createdStockSnapshots.push(first.id);

    await expect(
      prisma.stockSnapshot.create({
        data: { itemId: item.id, warehouseId: warehouse.id, quantityOnHand: 20 },
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate zohoItemId (requirement #8: Zoho IDs as stable sync keys)", async () => {
    const item = await createTestItem();
    createdItems.push(item.id);

    await expect(
      prisma.item.create({
        data: {
          zohoItemId: item.zohoItemId, // duplicate
          sku: "SKU-DUP",
          itemName: "Duplicate",
          uom: "PCS",
          uomType: "DISCRETE",
          zohoItemType: "inventory",
          zohoStatus: "active",
          active: true,
          itemClassification: "RAW_MATERIAL",
          mrpPlanningStatus: "PLANNED",
        },
      }),
    ).rejects.toThrow();
  });
});
