/**
 * Shared types for the Zoho Inventory integration layer. No secrets, no
 * Prisma types with sensitive fields — this module is safe to import from
 * anywhere in src/lib/zoho.
 */

/** Zoho's multi-data-center domains. Dopar Energy's account may be on .in. */
export const ZOHO_DATA_CENTERS = ["com", "in", "eu", "au", "jp", "ca"] as const;
export type ZohoDataCenter = (typeof ZOHO_DATA_CENTERS)[number];

/**
 * Least-privilege, READ-only Zoho Inventory OAuth scopes for Phase 1.
 * Centralized here (the single source of truth for what the app requests) —
 * every entry is verified against the official Zoho Inventory API docs
 * (https://www.zoho.com/inventory/api/v1/oauth/) and maps 1:1 to the Zoho
 * REST endpoint(s) actually called by lib/zoho/sync/*:
 *
 *   ZohoInventory.items.READ            -> GET /items
 *                                          (also backs the Stock sync: item
 *                                          detail responses carry per-
 *                                          warehouse stock_on_hand — see
 *                                          sync/stock.ts)
 *   ZohoInventory.contacts.READ         -> GET /contacts?contact_type=vendor
 *                                          (Zoho Inventory has no separate
 *                                          "vendors" scope — vendors and
 *                                          customers are both Contacts)
 *   ZohoInventory.warehouses.READ       -> GET /warehouses
 *   ZohoInventory.purchaseorders.READ   -> GET /purchaseorders,
 *                                          GET /purchaseorders/{id}
 *   ZohoInventory.purchasereceives.READ -> GET /purchasereceives,
 *                                          GET /purchasereceives/{id}
 *   ZohoInventory.salesorders.READ      -> GET /salesorders,
 *                                          GET /salesorders/{id}
 *
 * Deliberately excludes:
 *  - Any CREATE/UPDATE/DELETE scope — Phase 1 is read-only end-to-end; every
 *    sync module issues GET requests only (confirmed by inspection, not
 *    assumed).
 *  - ZohoInventory.organizations.* — no sync module calls /organizations;
 *    the Zoho Organization ID is entered manually by the connecting ADMIN.
 *  - The previously-requested ZohoInventory.fullaccess.all — replaced for
 *    least privilege now that a real Zoho app is being registered.
 *
 * Add a new entry here (and to the doc comment above) if a future sync
 * module needs another module's data — never widen an existing entry to
 * *.ALL or add fullaccess as a shortcut.
 */
export const ZOHO_INVENTORY_OAUTH_SCOPES = [
  "ZohoInventory.items.READ",
  "ZohoInventory.contacts.READ",
  "ZohoInventory.warehouses.READ",
  "ZohoInventory.purchaseorders.READ",
  "ZohoInventory.purchasereceives.READ",
  "ZohoInventory.salesorders.READ",
] as const;

/** Comma-joined scope string, exactly as Zoho's `scope` OAuth param expects. */
export const ZOHO_INVENTORY_OAUTH_SCOPE = ZOHO_INVENTORY_OAUTH_SCOPES.join(",");

export interface ZohoOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  api_domain: string;
  token_type: string;
  expires_in: number;
}

export interface ResolvedZohoConnection {
  connectionId: string;
  zohoOrganizationId: string;
  apiDomain: string;
  accessToken: string;
  tokenExpiresAt: Date;
}

/** One page of raw (unvalidated) Zoho API results. */
export interface ZohoPage<TRaw> {
  items: TRaw[];
  hasMorePage: boolean;
}

export interface SyncCounts {
  processed: number;
  created: number;
  updated: number;
  failed: number;
}

export interface SyncRunResult extends SyncCounts {
  syncLogId: string;
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
}

/**
 * Lives here (not sync/index.ts) deliberately: this file has zero
 * server-only dependencies, so Client Components can safely import this
 * constant/type without pulling Prisma/pg into the browser bundle — see
 * app/zoho/sync-buttons.tsx.
 */
export const ZOHO_SYNC_ENTITIES = [
  "ITEM",
  "VENDOR",
  "WAREHOUSE",
  "PURCHASE_ORDER",
  "PURCHASE_RECEIPT",
  "SALES_ORDER",
  "STOCK",
] as const;
export type ZohoSyncEntity = (typeof ZOHO_SYNC_ENTITIES)[number];
