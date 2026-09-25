import { describe, it, expect } from "vitest";
import {
  inferUomType,
  mapItemZohoFields,
  mapNewItemMrpDefaults,
  rawZohoItemSchema,
} from "@/lib/zoho/mappers/item";
import { mapVendor, rawZohoVendorSchema } from "@/lib/zoho/mappers/vendor";
import { mapWarehouseZohoFields, rawZohoWarehouseSchema } from "@/lib/zoho/mappers/warehouse";
import {
  computeUsableForMrp,
  mapPurchaseOrder,
  rawZohoPurchaseOrderSchema,
} from "@/lib/zoho/mappers/purchaseOrder";
import {
  mapPurchaseReceipt,
  rawZohoPurchaseReceiptSchema,
} from "@/lib/zoho/mappers/purchaseReceipt";
import { mapSalesOrder, rawZohoSalesOrderSchema } from "@/lib/zoho/mappers/salesOrder";
import { mapItemStockSnapshots, rawZohoItemStockDetailSchema } from "@/lib/zoho/mappers/stock";

describe("Item mapping", () => {
  it("infers CONTINUOUS for divisible units and DISCRETE otherwise", () => {
    expect(inferUomType("kg")).toBe("CONTINUOUS");
    expect(inferUomType("Kg")).toBe("CONTINUOUS");
    expect(inferUomType("ltr")).toBe("CONTINUOUS");
    expect(inferUomType("pcs")).toBe("DISCRETE");
    expect(inferUomType("nos")).toBe("DISCRETE");
    expect(inferUomType("totally-unknown-unit")).toBe("DISCRETE"); // safe default
  });

  it("validates a raw item and applies defaults for missing optional fields", () => {
    const parsed = rawZohoItemSchema.parse({ item_id: "1", name: "MOSFET-001" });
    expect(parsed.unit).toBe("qty");
    expect(parsed.status).toBe("active");
  });

  it("rejects an item missing a required field", () => {
    expect(() => rawZohoItemSchema.parse({ name: "no id" })).toThrow();
  });

  it("maps Zoho-owned fields without touching MRP-owned ones", () => {
    const raw = rawZohoItemSchema.parse({
      item_id: "1",
      name: "MOSFET-001",
      sku: "MOS-1",
      unit: "pcs",
      status: "active",
    });
    const fields = mapItemZohoFields(raw);
    expect(fields).not.toHaveProperty("uomType");
    expect(fields).not.toHaveProperty("itemClassification");
    expect(fields).not.toHaveProperty("mrpPlanningStatus");
    expect(fields.active).toBe(true);
  });

  it("provides safe, documented MRP defaults for brand-new items only", () => {
    const raw = rawZohoItemSchema.parse({ item_id: "1", name: "x", unit: "kg" });
    const defaults = mapNewItemMrpDefaults(raw);
    expect(defaults.itemClassification).toBe("PURCHASED_COMPONENT");
    expect(defaults.uomType).toBe("CONTINUOUS");
  });
});

describe("Vendor mapping", () => {
  it("maps every field (no MRP-owned fields to protect)", () => {
    const raw = rawZohoVendorSchema.parse({ contact_id: "v1", contact_name: "Acme Co" });
    const mapped = mapVendor(raw);
    expect(mapped.zohoVendorId).toBe("v1");
    expect(mapped.vendorName).toBe("Acme Co");
  });
});

describe("Warehouse mapping", () => {
  it("never includes usableForMrp or notes", () => {
    const raw = rawZohoWarehouseSchema.parse({ warehouse_id: "w1", warehouse_name: "Main" });
    const fields = mapWarehouseZohoFields(raw);
    expect(fields).not.toHaveProperty("usableForMrp");
    expect(fields).not.toHaveProperty("notes");
  });
});

describe("computeUsableForMrp (requirement #17)", () => {
  it.each([
    ["approved", 10, true],
    ["issued", 5, true],
    ["partially_received", 1, true],
    ["APPROVED", 10, true], // case-insensitive
    ["approved", 0, false], // nothing pending
    ["draft", 10, false],
    ["pending_approval", 10, false],
    ["cancelled", 10, false],
    ["closed", 10, false],
    ["received", 10, false],
    ["some_unrecognized_future_status", 10, false], // fail closed, never fail open
  ])("status=%s pending=%d -> usable=%s", (status, pending, expected) => {
    expect(computeUsableForMrp(status as string, pending as number)).toBe(expected);
  });

  it("mapPurchaseOrder computes usableForMrp per line from pending quantity and header status", () => {
    const raw = rawZohoPurchaseOrderSchema.parse({
      purchaseorder_id: "po1",
      purchaseorder_number: "PO-1",
      vendor_id: "v1",
      status: "issued",
      date: "2026-09-01",
      line_items: [
        { line_item_id: "l1", item_id: "i1", quantity: 100, quantity_received: 40 },
        { line_item_id: "l2", item_id: "i2", quantity: 50, quantity_received: 50 },
      ],
    });
    const mapped = mapPurchaseOrder(raw);
    expect(mapped.lines[0]!.pendingQuantity.toString()).toBe("60");
    expect(mapped.lines[0]!.usableForMrp).toBe(true);
    expect(mapped.lines[1]!.pendingQuantity.toString()).toBe("0");
    expect(mapped.lines[1]!.usableForMrp).toBe(false);
  });

  it("falls back to the PO header date when a line has no delivery date", () => {
    const raw = rawZohoPurchaseOrderSchema.parse({
      purchaseorder_id: "po1",
      purchaseorder_number: "PO-1",
      vendor_id: "v1",
      status: "issued",
      date: "2026-09-01",
      line_items: [{ line_item_id: "l1", item_id: "i1", quantity: 10, quantity_received: 0 }],
    });
    const mapped = mapPurchaseOrder(raw);
    expect(new Date(mapped.lines[0]!.expectedDeliveryDate).toISOString().slice(0, 10)).toBe(
      "2026-09-01",
    );
  });
});

describe("Purchase Receipt mapping", () => {
  it("carries a nullable PO-line reference", () => {
    const raw = rawZohoPurchaseReceiptSchema.parse({
      purchasereceive_id: "r1",
      receive_no: "PR-1",
      vendor_id: "v1",
      date: "2026-09-01",
      line_items: [
        { line_item_id: "rl1", item_id: "i1", quantity: 5, purchaseorder_item_id: "l1" },
        { line_item_id: "rl2", item_id: "i2", quantity: 3 },
      ],
    });
    const mapped = mapPurchaseReceipt(raw);
    expect(mapped.lines[0]!.zohoPoLineId).toBe("l1");
    expect(mapped.lines[1]!.zohoPoLineId).toBeNull();
  });
});

describe("Sales Order mapping", () => {
  it("maps lines without producing any Demand-shaped output (requirement #19)", () => {
    const raw = rawZohoSalesOrderSchema.parse({
      salesorder_id: "s1",
      salesorder_number: "SO-1",
      status: "confirmed",
      date: "2026-09-01",
      line_items: [{ line_item_id: "sl1", item_id: "i1", quantity: 10, quantity_shipped: 2 }],
    });
    const mapped = mapSalesOrder(raw);
    expect(mapped.lines[0]!.shippedQuantity!.toString()).toBe("2");
    expect(mapped).not.toHaveProperty("demand");
  });
});

describe("Stock snapshot mapping", () => {
  it("produces one row per warehouse and derives committed from on-hand minus available", () => {
    const raw = rawZohoItemStockDetailSchema.parse({
      item_id: "i1",
      warehouses: [
        { warehouse_id: "w1", warehouse_stock_on_hand: 100, warehouse_available_stock: 80 },
        { warehouse_id: "w2", warehouse_stock_on_hand: 20 },
      ],
    });
    const snapshots = mapItemStockSnapshots(raw);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.data.quantityCommitted?.toString()).toBe("20");
    expect(snapshots[1]!.data.quantityAvailable).toBeNull();
  });
});
