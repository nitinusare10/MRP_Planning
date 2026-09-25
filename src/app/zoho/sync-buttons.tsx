"use client";

import { useActionState } from "react";
import { triggerSyncAction } from "./actions";
import { zohoInitialActionState } from "./action-state";
import { ZOHO_SYNC_ENTITIES, type ZohoSyncEntity } from "@/lib/zoho/types";

const ENTITY_LABELS: Record<ZohoSyncEntity, string> = {
  ITEM: "Items",
  VENDOR: "Vendors",
  WAREHOUSE: "Warehouses",
  PURCHASE_ORDER: "Purchase Orders",
  PURCHASE_RECEIPT: "Purchase Receipts",
  SALES_ORDER: "Sales Orders",
  STOCK: "Stock",
};

function SyncButton({ entity, label }: { entity: ZohoSyncEntity | "ALL"; label: string }) {
  const [state, formAction, isPending] = useActionState(triggerSyncAction, zohoInitialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="entity" value={entity} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "Syncing..." : `Sync ${label} now`}
      </button>
      {state.message ? (
        <p
          role="status"
          className={`text-xs ${state.status === "error" ? "text-red-600" : "text-gray-600"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SyncButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      <SyncButton entity="ALL" label="all entities" />
      {ZOHO_SYNC_ENTITIES.map((entity) => (
        <SyncButton key={entity} entity={entity} label={ENTITY_LABELS[entity]} />
      ))}
    </div>
  );
}
