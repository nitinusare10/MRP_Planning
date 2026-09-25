// Kept separate from actions.ts on purpose: a "use server" file may only
// export async functions, so shared plain data (types, initial state) for
// the client components that call those actions has to live here instead.
export type ZohoActionState = { status: "idle" | "success" | "error"; message?: string };

export const zohoInitialActionState: ZohoActionState = { status: "idle" };
