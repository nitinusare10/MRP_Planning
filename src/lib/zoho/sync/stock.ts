import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import {
  mapItemStockSnapshots,
  rawZohoItemStockDetailSchema,
  type RawZohoItemStockDetail,
} from "@/lib/zoho/mappers/stock";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";
import { logger } from "@/lib/logging";

async function persistItemStock(
  tx: Prisma.TransactionClient,
  raw: RawZohoItemStockDetail,
): Promise<PersistResult> {
  const item = await tx.item.findUnique({
    where: { zohoItemId: raw.item_id },
    select: { id: true },
  });
  if (!item) {
    return { skipped: true, reason: `item ${raw.item_id} not synced yet` };
  }

  const snapshots = mapItemStockSnapshots(raw);
  let anyWritten = false;
  for (const snap of snapshots) {
    const warehouse = await tx.warehouse.findUnique({
      where: { zohoWarehouseId: snap.zohoWarehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      logger.warn(
        { zohoWarehouseId: snap.zohoWarehouseId, zohoItemId: raw.item_id },
        "Skipping stock row — warehouse not synced yet",
      );
      continue;
    }
    // Latest-value upsert, not append-only history — see mappers/stock.ts
    // and docs/architecture.md "Stock Snapshot Sync" for why.
    await tx.stockSnapshot.upsert({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouse.id } },
      create: { ...snap.data, itemId: item.id, warehouseId: warehouse.id },
      update: snap.data,
    });
    anyWritten = true;
  }

  if (!anyWritten && snapshots.length > 0) {
    return { skipped: true, reason: `no warehouses synced for item ${raw.item_id}` };
  }
  // "created" isn't meaningful at the item level here (each item may touch
  // several StockSnapshot rows); report true only when we wrote at least one.
  return { created: anyWritten };
}

export async function syncStock(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "STOCK",
      fetchPage: (c, page) => fetchZohoListPage(c, "/items", "items", page),
      validate: (raw) => rawZohoItemStockDetailSchema.parse(raw),
      persist: persistItemStock,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
