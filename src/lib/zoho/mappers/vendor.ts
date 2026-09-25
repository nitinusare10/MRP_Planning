import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const rawZohoVendorSchema = z.object({
  contact_id: z.string().min(1),
  contact_name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  payment_terms_label: z.string().nullable().optional(),
  status: z.string().default("active"),
});

export type RawZohoVendor = z.infer<typeof rawZohoVendorSchema>;

/** Vendor has no MRP-owned fields, so sync may write every field on both create and update. */
export function mapVendor(raw: RawZohoVendor): Prisma.VendorUncheckedCreateInput {
  return {
    zohoVendorId: raw.contact_id,
    vendorName: raw.contact_name,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    paymentTerms: raw.payment_terms_label ?? null,
    zohoStatus: raw.status,
    lastSyncedAt: new Date(),
  };
}
