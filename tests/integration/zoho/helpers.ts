import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";

export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

export type FakeResponder = (path: string, query: Record<string, unknown> | undefined) => unknown;

/** A ZohoApiClient whose responses are fully controlled by the test. */
export function createFakeZohoClient(
  responder: FakeResponder,
  organizationId = "test-org",
): ZohoApiClient {
  return {
    organizationId,
    request: async <T>(path: string, options?: { query?: Record<string, unknown> }) => {
      return responder(path, options?.query) as T;
    },
  };
}

export function listEnvelope(
  arrayKey: string,
  items: unknown[],
  hasMorePage = false,
): Record<string, unknown> {
  return { [arrayKey]: items, page_context: { has_more_page: hasMorePage } };
}

/** Best-effort cleanup for rows a Zoho sync test created, in FK-safe order. */
export async function cleanupZohoTestData(ids: {
  stockSnapshot?: string[];
  purchaseReceiptLine?: string[];
  purchaseReceipt?: string[];
  purchaseOrderLine?: string[];
  purchaseOrder?: string[];
  salesOrderLine?: string[];
  salesOrder?: string[];
  item?: string[];
  vendor?: string[];
  warehouse?: string[];
  syncLog?: string[];
  zohoConnection?: string[];
  user?: string[];
}): Promise<void> {
  const del = <T>(fn: () => Promise<T>) => fn().catch(() => undefined);

  if (ids.stockSnapshot?.length)
    await del(() => prisma.stockSnapshot.deleteMany({ where: { id: { in: ids.stockSnapshot } } }));
  if (ids.purchaseReceiptLine?.length)
    await del(() =>
      prisma.purchaseReceiptLine.deleteMany({ where: { id: { in: ids.purchaseReceiptLine } } }),
    );
  if (ids.purchaseReceipt?.length)
    await del(() =>
      prisma.purchaseReceipt.deleteMany({ where: { id: { in: ids.purchaseReceipt } } }),
    );
  if (ids.purchaseOrderLine?.length)
    await del(() =>
      prisma.purchaseOrderLine.deleteMany({ where: { id: { in: ids.purchaseOrderLine } } }),
    );
  if (ids.purchaseOrder?.length)
    await del(() => prisma.purchaseOrder.deleteMany({ where: { id: { in: ids.purchaseOrder } } }));
  if (ids.salesOrderLine?.length)
    await del(() =>
      prisma.salesOrderLine.deleteMany({ where: { id: { in: ids.salesOrderLine } } }),
    );
  if (ids.salesOrder?.length)
    await del(() => prisma.salesOrder.deleteMany({ where: { id: { in: ids.salesOrder } } }));
  if (ids.item?.length)
    await del(() => prisma.item.deleteMany({ where: { id: { in: ids.item } } }));
  if (ids.vendor?.length)
    await del(() => prisma.vendor.deleteMany({ where: { id: { in: ids.vendor } } }));
  if (ids.warehouse?.length)
    await del(() => prisma.warehouse.deleteMany({ where: { id: { in: ids.warehouse } } }));
  if (ids.syncLog?.length)
    await del(() => prisma.syncLog.deleteMany({ where: { id: { in: ids.syncLog } } }));
  if (ids.zohoConnection?.length)
    await del(() =>
      prisma.zohoConnection.deleteMany({ where: { id: { in: ids.zohoConnection } } }),
    );
  if (ids.user?.length)
    await del(() => prisma.user.deleteMany({ where: { id: { in: ids.user } } }));
}

/** Finds every SyncLog row created during a test window, for assertions + cleanup. */
export async function syncLogsSince(after: Date, entityType?: string) {
  return prisma.syncLog.findMany({
    where: {
      runStartedAt: { gte: after },
      ...(entityType ? { syncEntityType: entityType as never } : {}),
    },
    orderBy: { runStartedAt: "asc" },
  });
}
