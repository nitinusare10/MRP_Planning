import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const rawZohoPurchaseReceiptLineSchema = z.object({
  line_item_id: z.string().min(1),
  item_id: z.string().min(1),
  quantity: z.number().nonnegative(),
  // The PO *line* this receipt line fulfills — nullable because a receipt
  // can in principle arrive without a clean PO-line match.
  purchaseorder_item_id: z.string().nullable().optional(),
});

export const rawZohoPurchaseReceiptSchema = z.object({
  purchasereceive_id: z.string().min(1),
  receive_no: z.string().min(1),
  vendor_id: z.string().min(1),
  date: z.string().min(1),
  status: z.string().default("received"),
  line_items: z.array(rawZohoPurchaseReceiptLineSchema).default([]),
});

export type RawZohoPurchaseReceipt = z.infer<typeof rawZohoPurchaseReceiptSchema>;
export type RawZohoPurchaseReceiptLine = z.infer<typeof rawZohoPurchaseReceiptLineSchema>;

export interface MappedPurchaseReceipt {
  header: Prisma.PurchaseReceiptUncheckedCreateInput;
  lines: Array<
    Omit<
      Prisma.PurchaseReceiptLineUncheckedCreateInput,
      "purchaseReceiptId" | "itemId" | "purchaseOrderLineId"
    > & {
      zohoItemId: string;
      zohoPoLineId: string | null;
    }
  >;
}

export function mapPurchaseReceipt(raw: RawZohoPurchaseReceipt): MappedPurchaseReceipt {
  const now = new Date();
  return {
    header: {
      zohoReceiptId: raw.purchasereceive_id,
      receiptNumber: raw.receive_no,
      vendorId: "", // resolved by the sync module
      receivedDate: new Date(raw.date),
      status: raw.status,
      lastSyncedAt: now,
    },
    lines: raw.line_items.map((line) => ({
      zohoReceiptLineId: line.line_item_id,
      zohoItemId: line.item_id,
      zohoPoLineId: line.purchaseorder_item_id ?? null,
      quantityReceived: line.quantity,
      lastSyncedAt: now,
    })),
  };
}
