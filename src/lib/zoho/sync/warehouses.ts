import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import {
  mapWarehouseZohoFields,
  rawZohoWarehouseSchema,
  type RawZohoWarehouse,
} from "@/lib/zoho/mappers/warehouse";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";

async function persistWarehouse(
  tx: Prisma.TransactionClient,
  raw: RawZohoWarehouse,
): Promise<PersistResult> {
  const zohoFields = mapWarehouseZohoFields(raw);
  const existing = await tx.warehouse.findUnique({
    where: { zohoWarehouseId: raw.warehouse_id },
    select: { id: true },
  });

  if (existing) {
    // usableForMrp/notes are MRP-owned planning config — sync must never
    // touch them (requirement #15).
    await tx.warehouse.update({ where: { id: existing.id }, data: zohoFields });
    return { created: false };
  }

  await tx.warehouse.create({ data: zohoFields });
  return { created: true };
}

export async function syncWarehouses(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "WAREHOUSE",
      fetchPage: (c, page) => fetchZohoListPage(c, "/warehouses", "warehouses", page),
      validate: (raw) => rawZohoWarehouseSchema.parse(raw),
      persist: persistWarehouse,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
