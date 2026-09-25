import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const rawZohoPurchaseOrderLineSchema = z.object({
  line_item_id: z.string().min(1),
  item_id: z.string().min(1),
  quantity: z.number().nonnegative(),
  quantity_received: z.number().nonnegative().default(0),
  rate: z.number().nonnegative().nullable().optional(),
  // VERIFY: line-level delivery date field name/presence against the live
  // API; falls back to the PO header's `date` when absent so a sync never
  // hard-fails on this alone.
  expected_delivery_date: z.string().nullable().optional(),
});

export const rawZohoPurchaseOrderSchema = z.object({
  purchaseorder_id: z.string().min(1),
  purchaseorder_number: z.string().min(1),
  vendor_id: z.string().min(1),
  status: z.string().default("draft"),
  date: z.string().min(1),
  currency_code: z.string().nullable().optional(),
  line_items: z.array(rawZohoPurchaseOrderLineSchema).default([]),
});

export type RawZohoPurchaseOrder = z.infer<typeof rawZohoPurchaseOrderSchema>;
export type RawZohoPurchaseOrderLine = z.infer<typeof rawZohoPurchaseOrderLineSchema>;

/**
 * PO statuses Zoho Inventory exposes. Zoho does not expose a distinct
 * per-line status in the well-documented part of the API, so every line
 * inherits its header's status for the purposes of usableForMrp — see
 * mappers/README.md.
 */
const USABLE_PO_STATUSES = new Set(["approved", "issued", "partially_received"]);

/**
 * The single rule the future MRP engine depends on (requirement #17):
 * usable only when the line still has pending quantity AND the order is in
 * a confirmed/open/partially-received state. Cancelled, closed, draft,
 * pending-approval, fully-received, or any status we don't explicitly
 * recognize are all NOT usable — fail closed, never fail open on an unknown
 * status string.
 */
export function computeUsableForMrp(poStatus: string, pendingQuantity: number): boolean {
  if (pendingQuantity <= 0) return false;
  return USABLE_PO_STATUSES.has(poStatus.toLowerCase());
}

export interface MappedPurchaseOrder {
  zohoVendorId: string;
  header: Omit<Prisma.PurchaseOrderUncheckedCreateInput, "vendorId">;
  lines: Array<
    Omit<Prisma.PurchaseOrderLineUncheckedCreateInput, "purchaseOrderId" | "itemId"> & {
      zohoItemId: string;
    }
  >;
}

export function mapPurchaseOrder(raw: RawZohoPurchaseOrder): MappedPurchaseOrder {
  const now = new Date();
  return {
    zohoVendorId: raw.vendor_id,
    header: {
      zohoPoId: raw.purchaseorder_id,
      poNumber: raw.purchaseorder_number,
      status: raw.status,
      orderDate: new Date(raw.date),
      currency: raw.currency_code ?? null,
      lastSyncedAt: now,
    },
    lines: raw.line_items.map((line) => {
      const pendingQuantity = Math.max(line.quantity - line.quantity_received, 0);
      return {
        zohoPoLineId: line.line_item_id,
        zohoItemId: line.item_id,
        orderedQuantity: line.quantity,
        receivedQuantity: line.quantity_received,
        pendingQuantity,
        rate: line.rate ?? null,
        expectedDeliveryDate: new Date(line.expected_delivery_date ?? raw.date),
        lineStatus: raw.status,
        usableForMrp: computeUsableForMrp(raw.status, pendingQuantity),
        lastSyncedAt: now,
      };
    }),
  };
}
