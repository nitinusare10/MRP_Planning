import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const rawZohoSalesOrderLineSchema = z.object({
  line_item_id: z.string().min(1),
  item_id: z.string().min(1),
  quantity: z.number().nonnegative(),
  quantity_shipped: z.number().nonnegative().default(0),
  // VERIFY: exact field name/presence against the live API.
  expected_shipment_date: z.string().nullable().optional(),
});

export const rawZohoSalesOrderSchema = z.object({
  salesorder_id: z.string().min(1),
  salesorder_number: z.string().min(1),
  customer_name: z.string().nullable().optional(),
  status: z.string().default("draft"),
  date: z.string().min(1),
  line_items: z.array(rawZohoSalesOrderLineSchema).default([]),
});

export type RawZohoSalesOrder = z.infer<typeof rawZohoSalesOrderSchema>;
export type RawZohoSalesOrderLine = z.infer<typeof rawZohoSalesOrderLineSchema>;

export interface MappedSalesOrder {
  header: Prisma.SalesOrderUncheckedCreateInput;
  lines: Array<
    Omit<Prisma.SalesOrderLineUncheckedCreateInput, "salesOrderId" | "itemId"> & {
      zohoItemId: string;
    }
  >;
}

// Phase 1 syncs Sales Orders as read-only reference/cache data only — see
// requirement #19: this deliberately does NOT create Demand rows. That
// normalization belongs to the future Demand & Production Planning phase.
export function mapSalesOrder(raw: RawZohoSalesOrder): MappedSalesOrder {
  const now = new Date();
  return {
    header: {
      zohoSoId: raw.salesorder_id,
      soNumber: raw.salesorder_number,
      customerName: raw.customer_name ?? null,
      orderDate: new Date(raw.date),
      status: raw.status,
      lastSyncedAt: now,
    },
    lines: raw.line_items.map((line) => ({
      zohoSoLineId: line.line_item_id,
      zohoItemId: line.item_id,
      quantity: line.quantity,
      shippedQuantity: line.quantity_shipped,
      expectedShipmentDate: line.expected_shipment_date
        ? new Date(line.expected_shipment_date)
        : null,
      status: raw.status,
      lastSyncedAt: now,
    })),
  };
}
