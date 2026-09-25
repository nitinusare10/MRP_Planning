import type { SyncTrigger } from "@/generated/prisma/client";
import { createConnectedZohoClient } from "@/lib/zoho/client/connectedClient";
import type { SyncRunResult, ZohoSyncEntity } from "@/lib/zoho/types";
import { syncItems } from "@/lib/zoho/sync/items";
import { syncVendors } from "@/lib/zoho/sync/vendors";
import { syncWarehouses } from "@/lib/zoho/sync/warehouses";
import { syncPurchaseOrders } from "@/lib/zoho/sync/purchaseOrders";
import { syncPurchaseReceipts } from "@/lib/zoho/sync/purchaseReceipts";
import { syncSalesOrders } from "@/lib/zoho/sync/salesOrders";
import { syncStock } from "@/lib/zoho/sync/stock";

export { syncItems } from "@/lib/zoho/sync/items";
export { syncVendors } from "@/lib/zoho/sync/vendors";
export { syncWarehouses } from "@/lib/zoho/sync/warehouses";
export { syncPurchaseOrders } from "@/lib/zoho/sync/purchaseOrders";
export { syncPurchaseReceipts } from "@/lib/zoho/sync/purchaseReceipts";
export { syncSalesOrders } from "@/lib/zoho/sync/salesOrders";
export { syncStock } from "@/lib/zoho/sync/stock";

export { ZOHO_SYNC_ENTITIES, type ZohoSyncEntity } from "@/lib/zoho/types";

/**
 * Runs every sync in the dependency order later entities need: Item/Vendor/
 * Warehouse must land before anything that references them by Zoho ID
 * (Purchase Orders/Receipts/Sales Orders/Stock all resolve those FKs during
 * persist and skip-with-a-logged-reason when the referenced master record
 * hasn't synced yet — see each sync module's persist function).
 */
export async function syncAll(options: {
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
}): Promise<Record<ZohoSyncEntity, SyncRunResult>> {
  const client = await createConnectedZohoClient();
  const shared = { ...options, client };

  const results = {
    ITEM: await syncItems(shared),
    VENDOR: await syncVendors(shared),
    WAREHOUSE: await syncWarehouses(shared),
    PURCHASE_ORDER: await syncPurchaseOrders(shared),
    PURCHASE_RECEIPT: await syncPurchaseReceipts(shared),
    SALES_ORDER: await syncSalesOrders(shared),
    STOCK: await syncStock(shared),
  } satisfies Record<ZohoSyncEntity, SyncRunResult>;

  return results;
}
