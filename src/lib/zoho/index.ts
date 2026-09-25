/**
 * Public surface of the Zoho integration layer. Import from here (or from
 * the specific submodule) rather than reaching into internals — nothing
 * exported here is browser-safe on its own; it's still meant to be called
 * only from server-side code (Server Actions, Route Handlers, services).
 */
export * from "@/lib/zoho/types";
export * from "@/lib/zoho/errors";
export { ZOHO_SYNC_ENTITIES, syncAll } from "@/lib/zoho/sync";
export {
  syncItems,
  syncVendors,
  syncWarehouses,
  syncPurchaseOrders,
  syncPurchaseReceipts,
  syncSalesOrders,
  syncStock,
} from "@/lib/zoho/sync";
