/**
 * Shared types for the Zoho Inventory integration layer. No secrets, no
 * Prisma types with sensitive fields — this module is safe to import from
 * anywhere in src/lib/zoho.
 */

/** Zoho's multi-data-center domains. Dopar Energy's account may be on .in. */
export const ZOHO_DATA_CENTERS = ["com", "in", "eu", "au", "jp", "ca"] as const;
export type ZohoDataCenter = (typeof ZOHO_DATA_CENTERS)[number];

/**
 * Broad Zoho Inventory OAuth scope. Narrow this once a real API console app
 * is registered and you know exactly which modules Dopar needs — see
 * docs/architecture.md "Zoho Integration Architecture" for how to change it.
 */
export const ZOHO_INVENTORY_OAUTH_SCOPE = "ZohoInventory.fullaccess.all";

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
