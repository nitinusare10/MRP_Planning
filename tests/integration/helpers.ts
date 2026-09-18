import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type {
  Item,
  Role,
  User,
  Vendor,
  Warehouse,
  ItemClassification,
} from "@/generated/prisma/client";

export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

export async function createTestUser(overrides: { role?: Role } = {}): Promise<User> {
  const suffix = uniqueSuffix();
  return prisma.user.create({
    data: {
      name: `Test User ${suffix}`,
      email: `test-${suffix}@example.com`,
      role: overrides.role ?? "ADMIN",
      active: true,
    },
  });
}

export async function createTestItem(
  overrides: { itemClassification?: ItemClassification } = {},
): Promise<Item> {
  const suffix = uniqueSuffix();
  return prisma.item.create({
    data: {
      zohoItemId: `zoho-item-${suffix}`,
      sku: `SKU-${suffix}`,
      itemName: `Test Item ${suffix}`,
      uom: "PCS",
      uomType: "DISCRETE",
      zohoItemType: "inventory",
      zohoStatus: "active",
      active: true,
      itemClassification: overrides.itemClassification ?? "PURCHASED_COMPONENT",
      mrpPlanningStatus: "PLANNED",
    },
  });
}

export async function createTestVendor(): Promise<Vendor> {
  const suffix = uniqueSuffix();
  return prisma.vendor.create({
    data: {
      zohoVendorId: `zoho-vendor-${suffix}`,
      vendorName: `Test Vendor ${suffix}`,
      zohoStatus: "active",
    },
  });
}

export async function createTestWarehouse(usableForMrp = true): Promise<Warehouse> {
  const suffix = uniqueSuffix();
  return prisma.warehouse.create({
    data: {
      zohoWarehouseId: `zoho-warehouse-${suffix}`,
      warehouseName: `Test Warehouse ${suffix}`,
      zohoStatus: "active",
      usableForMrp,
    },
  });
}

/**
 * Deletes rows created by a test, in FK-safe (children-first) order.
 *
 * Best-effort throughout: MrpResult/MrpResultPeriod/MrpResultDemandLink are
 * permanently append-only by design (requirement #11) and an Approved/Obsolete
 * Bom cannot be deleted (requirement #3) — deletes against those are *expected*
 * to fail whenever a test actually exercised that immutability. That's the
 * feature working, not a leak to fix, so failures there are swallowed; the
 * fixtures simply remain in the ephemeral, per-run test database.
 */
export async function cleanupIds(tables: {
  bomComponent?: string[];
  bom?: string[];
  mrpResultDemandLink?: string[];
  mrpResultPeriod?: string[];
  purchaseRequisitionLine?: string[];
  purchaseRequisition?: string[];
  purchaseRecommendation?: string[];
  mrpResult?: string[];
  mrpException?: string[];
  mrpRun?: string[];
  demand?: string[];
  productionPlanLine?: string[];
  productionPlan?: string[];
  itemVendor?: string[];
  stockSnapshot?: string[];
  item?: string[];
  vendor?: string[];
  warehouse?: string[];
  user?: string[];
}): Promise<void> {
  const del = <T>(fn: () => Promise<T>) => fn().catch(() => undefined);

  if (tables.bomComponent?.length)
    await del(() => prisma.bomComponent.deleteMany({ where: { id: { in: tables.bomComponent } } }));
  if (tables.mrpResultDemandLink?.length)
    await del(() =>
      prisma.mrpResultDemandLink.deleteMany({ where: { id: { in: tables.mrpResultDemandLink } } }),
    );
  if (tables.mrpResultPeriod?.length)
    await del(() =>
      prisma.mrpResultPeriod.deleteMany({ where: { id: { in: tables.mrpResultPeriod } } }),
    );
  if (tables.purchaseRequisitionLine?.length)
    await del(() =>
      prisma.purchaseRequisitionLine.deleteMany({
        where: { id: { in: tables.purchaseRequisitionLine } },
      }),
    );
  if (tables.purchaseRequisition?.length)
    await del(() =>
      prisma.purchaseRequisition.deleteMany({ where: { id: { in: tables.purchaseRequisition } } }),
    );
  if (tables.purchaseRecommendation?.length)
    await del(() =>
      prisma.purchaseRecommendation.deleteMany({
        where: { id: { in: tables.purchaseRecommendation } },
      }),
    );
  if (tables.mrpResult?.length)
    await del(() => prisma.mrpResult.deleteMany({ where: { id: { in: tables.mrpResult } } }));
  if (tables.mrpException?.length)
    await del(() => prisma.mrpException.deleteMany({ where: { id: { in: tables.mrpException } } }));
  if (tables.mrpRun?.length)
    await del(() => prisma.mrpRun.deleteMany({ where: { id: { in: tables.mrpRun } } }));
  if (tables.demand?.length)
    await del(() => prisma.demand.deleteMany({ where: { id: { in: tables.demand } } }));
  if (tables.productionPlanLine?.length)
    await del(() =>
      prisma.productionPlanLine.deleteMany({ where: { id: { in: tables.productionPlanLine } } }),
    );
  if (tables.productionPlan?.length)
    await del(() =>
      prisma.productionPlan.deleteMany({ where: { id: { in: tables.productionPlan } } }),
    );
  if (tables.itemVendor?.length)
    await del(() => prisma.itemVendor.deleteMany({ where: { id: { in: tables.itemVendor } } }));
  if (tables.stockSnapshot?.length)
    await del(() =>
      prisma.stockSnapshot.deleteMany({ where: { id: { in: tables.stockSnapshot } } }),
    );
  if (tables.bom?.length)
    await del(() => prisma.bom.deleteMany({ where: { id: { in: tables.bom } } }));
  if (tables.item?.length)
    await del(() => prisma.item.deleteMany({ where: { id: { in: tables.item } } }));
  if (tables.vendor?.length)
    await del(() => prisma.vendor.deleteMany({ where: { id: { in: tables.vendor } } }));
  if (tables.warehouse?.length)
    await del(() => prisma.warehouse.deleteMany({ where: { id: { in: tables.warehouse } } }));
  if (tables.user?.length)
    await del(() => prisma.user.deleteMany({ where: { id: { in: tables.user } } }));
}
