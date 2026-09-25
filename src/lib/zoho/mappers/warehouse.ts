import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const rawZohoWarehouseSchema = z.object({
  warehouse_id: z.string().min(1),
  warehouse_name: z.string().min(1),
  status: z.string().default("active"),
  is_primary: z.boolean().default(false),
});

export type RawZohoWarehouse = z.infer<typeof rawZohoWarehouseSchema>;

/** Zoho-owned fields only. `usableForMrp` and `notes` are MRP-owned and never touched here. */
export function mapWarehouseZohoFields(
  raw: RawZohoWarehouse,
): Omit<Prisma.WarehouseUncheckedCreateInput, "usableForMrp" | "notes"> {
  return {
    zohoWarehouseId: raw.warehouse_id,
    warehouseName: raw.warehouse_name,
    isPrimary: raw.is_primary,
    zohoStatus: raw.status,
    lastSyncedAt: new Date(),
  };
}
