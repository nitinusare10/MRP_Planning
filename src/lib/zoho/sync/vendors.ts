import type { Prisma, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import { mapVendor, rawZohoVendorSchema, type RawZohoVendor } from "@/lib/zoho/mappers/vendor";
import { runEntitySync, type PersistResult } from "@/lib/zoho/sync/engine";
import type { SyncRunResult } from "@/lib/zoho/types";

async function persistVendor(
  tx: Prisma.TransactionClient,
  raw: RawZohoVendor,
): Promise<PersistResult> {
  const data = mapVendor(raw);
  const existing = await tx.vendor.findUnique({
    where: { zohoVendorId: raw.contact_id },
    select: { id: true },
  });

  if (existing) {
    await tx.vendor.update({ where: { id: existing.id }, data });
    return { created: false };
  }
  await tx.vendor.create({ data });
  return { created: true };
}

export async function syncVendors(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
  client?: ZohoApiClient;
}): Promise<SyncRunResult> {
  const client = options.client ?? (await createConnectedZohoClient());
  return runEntitySync(
    {
      entityType: "VENDOR",
      fetchPage: (c, page) =>
        fetchZohoListPage(c, "/contacts", "contacts", page, { query: { contact_type: "vendor" } }),
      validate: (raw) => rawZohoVendorSchema.parse(raw),
      persist: persistVendor,
    },
    { client, triggerType: options.triggerType, triggeredByUserId: options.triggeredByUserId },
  );
}
