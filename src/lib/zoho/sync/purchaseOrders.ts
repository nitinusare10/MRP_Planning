import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import {
  mapPurchaseOrder,
  rawZohoPurchaseOrderSchema,
  type MappedPurchaseOrder,
  type RawZohoPurchaseOrder,
} from "@/lib/zoho/mappers/purchaseOrder";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";
import { logger } from "@/lib/logging";

interface ZohoPurchaseOrderDetailEnvelope {
  purchaseorder?: unknown;
}

/**
 * Zoho's list endpoint returns PO summaries without line items; the detail
 * endpoint (fetched per record) has them. This enrichment step is pure
 * network I/O — no DB access — so it stays outside the persist transaction
 * (requirement #21).
 */
async function enrichPurchaseOrder(
  client: ZohoApiClient,
  raw: RawZohoPurchaseOrder,
): Promise<MappedPurchaseOrder> {
  const detailJson = await client.request<ZohoPurchaseOrderDetailEnvelope>(
    `/purchaseorders/${raw.purchaseorder_id}`,
  );
  const detail = rawZohoPurchaseOrderSchema.parse(detailJson.purchaseorder ?? detailJson);
  return mapPurchaseOrder(detail);
}

async function persistPurchaseOrder(
  tx: Prisma.TransactionClient,
  mapped: MappedPurchaseOrder,
): Promise<PersistResult> {
  const vendor = await tx.vendor.findUnique({
    where: { zohoVendorId: mapped.zohoVendorId },
    select: { id: true },
  });
  if (!vendor) {
    return { skipped: true, reason: `vendor ${mapped.zohoVendorId} not synced yet` };
  }

  const existing = await tx.purchaseOrder.findUnique({
    where: { zohoPoId: mapped.header.zohoPoId },
    select: { id: true },
  });

  const purchaseOrderId = existing
    ? (
        await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: { ...mapped.header, vendorId: vendor.id },
        })
      ).id
    : (await tx.purchaseOrder.create({ data: { ...mapped.header, vendorId: vendor.id } })).id;

  for (const line of mapped.lines) {
    const { zohoItemId, ...lineFields } = line;
    const item = await tx.item.findUnique({ where: { zohoItemId }, select: { id: true } });
    if (!item) {
      logger.warn(
        { zohoPoLineId: line.zohoPoLineId, zohoItemId },
        "Skipping PO line — item not synced yet",
      );
      continue;
    }
    await tx.purchaseOrderLine.upsert({
      where: { zohoPoLineId: line.zohoPoLineId },
      create: { ...lineFields, purchaseOrderId, itemId: item.id },
      update: { ...lineFields, itemId: item.id },
    });
  }

  return { created: !existing };
}

export async function syncPurchaseOrders(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "PURCHASE_ORDER",
      fetchPage: (c, page) => fetchZohoListPage(c, "/purchaseorders", "purchaseorders", page),
      validate: (raw) => rawZohoPurchaseOrderSchema.parse(raw),
      enrich: enrichPurchaseOrder,
      persist: persistPurchaseOrder,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
