import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const rawZohoItemWarehouseStockSchema = z.object({
  warehouse_id: z.string().min(1),
  warehouse_stock_on_hand: z.number().nonnegative(),
  warehouse_available_stock: z.number().nonnegative().nullable().optional(),
  warehouse_actual_available_stock: z.number().nonnegative().nullable().optional(),
});

export const rawZohoItemStockDetailSchema = z.object({
  item_id: z.string().min(1),
  warehouses: z.array(rawZohoItemWarehouseStockSchema).default([]),
});

export type RawZohoItemStockDetail = z.infer<typeof rawZohoItemStockDetailSchema>;
export type RawZohoItemWarehouseStock = z.infer<typeof rawZohoItemWarehouseStockSchema>;

export interface MappedStockSnapshot {
  zohoItemId: string;
  zohoWarehouseId: string;
  data: Omit<Prisma.StockSnapshotUncheckedCreateInput, "itemId" | "warehouseId">;
}

/**
 * One row per (item, warehouse) the item detail reports stock for. Callers
 * upsert on the existing (itemId, warehouseId) unique constraint — see
 * docs/architecture.md "Stock Snapshot Sync" for why this stays a
 * latest-value cache rather than an append-only history (that's Phase 0's
 * already-approved design; historical traceability lives in MrpResult, not
 * here).
 */
export function mapItemStockSnapshots(raw: RawZohoItemStockDetail): MappedStockSnapshot[] {
  const now = new Date();
  return raw.warehouses.map((wh) => ({
    zohoItemId: raw.item_id,
    zohoWarehouseId: wh.warehouse_id,
    data: {
      quantityOnHand: wh.warehouse_stock_on_hand,
      quantityAvailable: wh.warehouse_available_stock ?? null,
      quantityCommitted:
        wh.warehouse_available_stock != null
          ? Math.max(wh.warehouse_stock_on_hand - wh.warehouse_available_stock, 0)
          : null,
      snapshotAt: now,
    },
  }));
}
