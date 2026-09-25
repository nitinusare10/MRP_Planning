"use client";

import { useActionState } from "react";
import { connectZohoAction } from "./actions";
import { zohoInitialActionState } from "./action-state";

export function ConnectForm() {
  const [state, formAction, isPending] = useActionState(connectZohoAction, zohoInitialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="organizationId" className="text-sm font-medium">
          Zoho Organization ID
        </label>
        <input
          id="organizationId"
          name="organizationId"
          type="text"
          required
          placeholder="e.g. 60012345678"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Redirecting..." : "Connect to Zoho"}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
