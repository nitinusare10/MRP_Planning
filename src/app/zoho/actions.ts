"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { toApiError } from "@/lib/errors";
import { disconnectZoho, startAuthorization, triggerSync } from "@/services/zohoIntegrationService";
import { ZOHO_SYNC_ENTITIES } from "@/lib/zoho/sync";
import type { ZohoActionState } from "./action-state";

const organizationIdSchema = z.object({
  organizationId: z.string().trim().min(1, "Enter your Zoho Organization ID."),
});

export async function connectZohoAction(
  _prevState: ZohoActionState,
  formData: FormData,
): Promise<ZohoActionState> {
  await requireRole(["ADMIN"]);

  const parsed = organizationIdSchema.safeParse({ organizationId: formData.get("organizationId") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let redirectUrl: string;
  try {
    const { url, stateCookie } = startAuthorization(parsed.data.organizationId);
    const cookieStore = await cookies();
    cookieStore.set("zoho_oauth_state", stateCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/zoho/oauth/callback",
    });
    redirectUrl = url;
  } catch (err) {
    const { body } = toApiError(err);
    return { status: "error", message: body.error.message };
  }

  redirect(redirectUrl);
}

export async function disconnectZohoAction(
  _prevState: ZohoActionState,
  _formData: FormData,
): Promise<ZohoActionState> {
  await requireRole(["ADMIN"]);

  try {
    await disconnectZoho();
  } catch (err) {
    const { body } = toApiError(err);
    return { status: "error", message: body.error.message };
  }

  revalidatePath("/zoho");
  return { status: "success", message: "Disconnected from Zoho." };
}

const syncEntitySchema = z.enum([...ZOHO_SYNC_ENTITIES, "ALL"]);

export async function triggerSyncAction(
  _prevState: ZohoActionState,
  formData: FormData,
): Promise<ZohoActionState> {
  const session = await requireRole(["ADMIN", "PLANNER"]);

  const parsed = syncEntitySchema.safeParse(formData.get("entity"));
  if (!parsed.success) {
    return { status: "error", message: "Unknown sync entity." };
  }

  try {
    const result = await triggerSync(parsed.data, session.user.id);
    revalidatePath("/zoho");
    const summary =
      "syncLogId" in result
        ? `Processed ${result.processed}, created ${result.created}, updated ${result.updated}, failed ${result.failed}.`
        : "Full sync complete — see history below for per-entity results.";
    return { status: "success", message: summary };
  } catch (err) {
    const { body } = toApiError(err);
    return { status: "error", message: body.error.message };
  }
}
