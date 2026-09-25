import { z } from "zod";
import type { Prisma, ItemUomType, ItemClassification } from "@/generated/prisma/client";

export const rawZohoItemSchema = z.object({
  item_id: z.string().min(1),
  sku: z.string().default(""),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  unit: z.string().default("qty"),
  item_type: z.string().default("inventory"),
  status: z.string().default("active"),
});

export type RawZohoItem = z.infer<typeof rawZohoItemSchema>;

/** UOM strings that represent a divisible/continuous quantity rather than whole units. */
const CONTINUOUS_UOM_PATTERNS = [
  "kg",
  "g",
  "gram",
  "l",
  "ltr",
  "liter",
  "litre",
  "m",
  "meter",
  "metre",
  "cm",
  "mm",
  "ft",
  "sq.ft",
  "sqft",
  "ton",
  "tonne",
  "hr",
  "hour",
];

/**
 * Best-effort heuristic — Zoho tells us the UOM string, not whether it
 * should be DISCRETE or CONTINUOUS for MOQ/order-multiple rounding. Applied
 * only when creating a new Item; a planner can correct it later (Phase 2)
 * and sync never overwrites it afterward.
 */
export function inferUomType(unit: string): ItemUomType {
  const normalized = unit.trim().toLowerCase();
  return CONTINUOUS_UOM_PATTERNS.includes(normalized) ? "CONTINUOUS" : "DISCRETE";
}

/**
 * Provisional default for a brand-new item — Zoho has no concept of our
 * make/buy business classification. New items sync in as NOT_PLANNED
 * (schema default) so this default never affects MRP until a planner
 * reviews and classifies the item (Phase 2 Item Master).
 */
export const DEFAULT_ITEM_CLASSIFICATION: ItemClassification = "PURCHASED_COMPONENT";

/** Fields set once, only when the Item row is first created. Never touched again by sync. */
export function mapNewItemMrpDefaults(raw: RawZohoItem): {
  uomType: ItemUomType;
  itemClassification: ItemClassification;
} {
  return {
    uomType: inferUomType(raw.unit),
    itemClassification: DEFAULT_ITEM_CLASSIFICATION,
  };
}

/** Zoho-owned fields only — safe to write on both create and update. */
export function mapItemZohoFields(
  raw: RawZohoItem,
): Omit<Prisma.ItemUncheckedCreateInput, "uomType" | "itemClassification" | "mrpPlanningStatus"> {
  return {
    zohoItemId: raw.item_id,
    sku: raw.sku,
    itemName: raw.name,
    description: raw.description ?? null,
    uom: raw.unit,
    zohoItemType: raw.item_type,
    zohoStatus: raw.status,
    active: raw.status.toLowerCase() === "active",
    lastSyncedAt: new Date(),
  };
}
