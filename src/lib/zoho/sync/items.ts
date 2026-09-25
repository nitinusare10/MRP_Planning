import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import {
  mapItemZohoFields,
  mapNewItemMrpDefaults,
  rawZohoItemSchema,
  type RawZohoItem,
} from "@/lib/zoho/mappers/item";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";

async function persistItem(tx: Prisma.TransactionClient, raw: RawZohoItem): Promise<PersistResult> {
  const zohoFields = mapItemZohoFields(raw);
  const existing = await tx.item.findUnique({
    where: { zohoItemId: raw.item_id },
    select: { id: true },
  });

  if (existing) {
    // Zoho-owned fields only — mrpPlanningStatus/uomType/itemClassification
    // are never touched after creation (requirement #13).
    await tx.item.update({ where: { id: existing.id }, data: zohoFields });
    return { created: false };
  }

  await tx.item.create({ data: { ...zohoFields, ...mapNewItemMrpDefaults(raw) } });
  return { created: true };
}

export async function syncItems(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "ITEM",
      fetchPage: (c, page) => fetchZohoListPage(c, "/items", "items", page),
      validate: (raw) => rawZohoItemSchema.parse(raw),
      persist: persistItem,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
