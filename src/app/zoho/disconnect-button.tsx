"use client";

import { useActionState } from "react";
import { disconnectZohoAction } from "./actions";
import { zohoInitialActionState } from "./action-state";

export function DisconnectButton() {
  const [state, formAction, isPending] = useActionState(
    disconnectZohoAction,
    zohoInitialActionState,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
      >
        {isPending ? "Disconnecting..." : "Disconnect"}
      </button>
      {state.message ? (
        <p
          role="status"
          className={`text-sm ${state.status === "error" ? "text-red-600" : "text-gray-600"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
