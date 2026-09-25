import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import {
  mapSalesOrder,
  rawZohoSalesOrderSchema,
  type MappedSalesOrder,
  type RawZohoSalesOrder,
} from "@/lib/zoho/mappers/salesOrder";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";
import { logger } from "@/lib/logging";

interface ZohoSalesOrderDetailEnvelope {
  salesorder?: unknown;
}

async function enrichSalesOrder(
  client: ZohoApiClient,
  raw: RawZohoSalesOrder,
): Promise<MappedSalesOrder> {
  const detailJson = await client.request<ZohoSalesOrderDetailEnvelope>(
    `/salesorders/${raw.salesorder_id}`,
  );
  const detail = rawZohoSalesOrderSchema.parse(detailJson.salesorder ?? detailJson);
  return mapSalesOrder(detail);
}

async function persistSalesOrder(
  tx: Prisma.TransactionClient,
  mapped: MappedSalesOrder,
): Promise<PersistResult> {
  const existing = await tx.salesOrder.findUnique({
    where: { zohoSoId: mapped.header.zohoSoId },
    select: { id: true },
  });

  const salesOrderId = existing
    ? (await tx.salesOrder.update({ where: { id: existing.id }, data: mapped.header })).id
    : (await tx.salesOrder.create({ data: mapped.header })).id;

  for (const line of mapped.lines) {
    const { zohoItemId, ...lineFields } = line;
    const item = await tx.item.findUnique({ where: { zohoItemId }, select: { id: true } });
    if (!item) {
      logger.warn(
        { zohoSoLineId: line.zohoSoLineId, zohoItemId },
        "Skipping SO line — item not synced yet",
      );
      continue;
    }
    await tx.salesOrderLine.upsert({
      where: { zohoSoLineId: line.zohoSoLineId },
      create: { ...lineFields, salesOrderId, itemId: item.id },
      update: { ...lineFields, itemId: item.id },
    });
  }

  return { created: !existing };
}

// Requirement #19: this caches Sales Orders for future use only — it never
// creates Demand rows. Demand normalization is a later phase's job.
export async function syncSalesOrders(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "SALES_ORDER",
      fetchPage: (c, page) => fetchZohoListPage(c, "/salesorders", "salesorders", page),
      validate: (raw) => rawZohoSalesOrderSchema.parse(raw),
      enrich: enrichSalesOrder,
      persist: persistSalesOrder,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
