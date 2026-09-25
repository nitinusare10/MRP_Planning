import { prisma } from "@/lib/db";
import type { SyncLog } from "@/generated/prisma/client";
import {
  getLatestConnection,
  disconnectConnection,
  toConnectionStatus,
  type ZohoConnectionStatus,
} from "@/lib/zoho/auth/connection";
import { buildAuthorizationUrl, getZohoOAuthConfig, isZohoConfigured } from "@/lib/zoho/auth/oauth";
import { createOAuthState } from "@/lib/zoho/auth/state";
import { syncAll, type ZohoSyncEntity } from "@/lib/zoho/sync";
import {
  syncItems,
  syncPurchaseOrders,
  syncPurchaseReceipts,
  syncSalesOrders,
  syncStock,
  syncVendors,
  syncWarehouses,
} from "@/lib/zoho/sync";
import type { SyncRunResult } from "@/lib/zoho/types";

export interface ZohoIntegrationOverview {
  configured: boolean;
  connection: ZohoConnectionStatus;
  recentSyncLogs: SyncLog[];
}

export async function getIntegrationOverview(): Promise<ZohoIntegrationOverview> {
  const [connection, recentSyncLogs] = await Promise.all([
    getLatestConnection(),
    prisma.syncLog.findMany({ orderBy: { runStartedAt: "desc" }, take: 20 }),
  ]);

  return {
    configured: isZohoConfigured(),
    connection: toConnectionStatus(connection),
    recentSyncLogs,
  };
}

/** Builds the URL to send the browser to in order to start the OAuth flow. */
export function startAuthorization(organizationId: string): { url: string; stateCookie: string } {
  const config = getZohoOAuthConfig(); // throws ZohoConfigurationError if not configured yet
  const { token, nonce } = createOAuthState(organizationId);
  const url = buildAuthorizationUrl(config, nonce);
  return { url, stateCookie: token };
}

export function disconnectZoho(): Promise<void> {
  return disconnectConnection();
}

const SYNC_FUNCTIONS: Record<
  ZohoSyncEntity,
  (opts: { triggerType: "MANUAL"; triggeredByUserId: string }) => Promise<SyncRunResult>
> = {
  ITEM: syncItems,
  VENDOR: syncVendors,
  WAREHOUSE: syncWarehouses,
  PURCHASE_ORDER: syncPurchaseOrders,
  PURCHASE_RECEIPT: syncPurchaseReceipts,
  SALES_ORDER: syncSalesOrders,
  STOCK: syncStock,
};

export async function triggerSync(
  entity: ZohoSyncEntity | "ALL",
  triggeredByUserId: string,
): Promise<SyncRunResult | Record<ZohoSyncEntity, SyncRunResult>> {
  if (entity === "ALL") {
    return syncAll({ triggerType: "MANUAL", triggeredByUserId });
  }
  return SYNC_FUNCTIONS[entity]({ triggerType: "MANUAL", triggeredByUserId });
}
