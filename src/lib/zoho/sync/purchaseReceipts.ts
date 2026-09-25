import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import {
  mapPurchaseReceipt,
  rawZohoPurchaseReceiptSchema,
  type MappedPurchaseReceipt,
  type RawZohoPurchaseReceipt,
} from "@/lib/zoho/mappers/purchaseReceipt";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";
import { logger } from "@/lib/logging";

interface ZohoPurchaseReceiptDetailEnvelope {
  purchasereceive?: unknown;
}

async function enrichPurchaseReceipt(
  client: ZohoApiClient,
  raw: RawZohoPurchaseReceipt,
): Promise<MappedPurchaseReceipt & { zohoVendorId: string }> {
  const detailJson = await client.request<ZohoPurchaseReceiptDetailEnvelope>(
    `/purchasereceives/${raw.purchasereceive_id}`,
  );
  const detail = rawZohoPurchaseReceiptSchema.parse(detailJson.purchasereceive ?? detailJson);
  return { ...mapPurchaseReceipt(detail), zohoVendorId: detail.vendor_id };
}

async function persistPurchaseReceipt(
  tx: Prisma.TransactionClient,
  mapped: MappedPurchaseReceipt & { zohoVendorId: string },
): Promise<PersistResult> {
  const vendor = await tx.vendor.findUnique({
    where: { zohoVendorId: mapped.zohoVendorId },
    select: { id: true },
  });
  if (!vendor) {
    return { skipped: true, reason: `vendor ${mapped.zohoVendorId} not synced yet` };
  }

  const existing = await tx.purchaseReceipt.findUnique({
    where: { zohoReceiptId: mapped.header.zohoReceiptId },
    select: { id: true },
  });

  const purchaseReceiptId = existing
    ? (
        await tx.purchaseReceipt.update({
          where: { id: existing.id },
          data: { ...mapped.header, vendorId: vendor.id },
        })
      ).id
    : (await tx.purchaseReceipt.create({ data: { ...mapped.header, vendorId: vendor.id } })).id;

  for (const line of mapped.lines) {
    const { zohoItemId, zohoPoLineId, ...lineFields } = line;
    const item = await tx.item.findUnique({ where: { zohoItemId }, select: { id: true } });
    if (!item) {
      logger.warn(
        { zohoReceiptLineId: line.zohoReceiptLineId, zohoItemId },
        "Skipping receipt line — item not synced yet",
      );
      continue;
    }
    const poLine = zohoPoLineId
      ? await tx.purchaseOrderLine.findUnique({ where: { zohoPoLineId }, select: { id: true } })
      : null;

    await tx.purchaseReceiptLine.upsert({
      where: { zohoReceiptLineId: line.zohoReceiptLineId },
      create: {
        ...lineFields,
        purchaseReceiptId,
        itemId: item.id,
        purchaseOrderLineId: poLine?.id ?? null,
      },
      update: { ...lineFields, itemId: item.id, purchaseOrderLineId: poLine?.id ?? null },
    });
  }

  return { created: !existing };
}

export async function syncPurchaseReceipts(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "PURCHASE_RECEIPT",
      fetchPage: (c, page) => fetchZohoListPage(c, "/purchasereceives", "purchasereceives", page),
      validate: (raw) => rawZohoPurchaseReceiptSchema.parse(raw),
      enrich: enrichPurchaseReceipt,
      persist: persistPurchaseReceipt,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
