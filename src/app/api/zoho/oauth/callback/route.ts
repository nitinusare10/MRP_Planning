import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { exchangeCodeForTokens, getZohoOAuthConfig } from "@/lib/zoho/auth/oauth";
import { verifyOAuthState } from "@/lib/zoho/auth/state";
import { saveConnectionFromTokens } from "@/lib/zoho/auth/connection";
import { toApiError } from "@/lib/errors";
import { logger } from "@/lib/logging";

function redirectWithError(request: NextRequest, message: string): NextResponse {
  const url = new URL("/zoho", request.url);
  url.searchParams.set("error", message);
  const response = NextResponse.redirect(url);
  response.cookies.delete("zoho_oauth_state");
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireRole(["ADMIN"]);

  const zohoError = request.nextUrl.searchParams.get("error");
  if (zohoError) {
    return redirectWithError(request, "Zoho declined the connection request.");
  }

  const code = request.nextUrl.searchParams.get("code") ?? undefined;
  const stateParam = request.nextUrl.searchParams.get("state") ?? undefined;
  const cookieToken = request.cookies.get("zoho_oauth_state")?.value;

  try {
    const statePayload = verifyOAuthState(cookieToken, stateParam);
    if (!code) {
      return redirectWithError(request, "Zoho did not return an authorization code.");
    }

    const config = getZohoOAuthConfig();
    const tokens = await exchangeCodeForTokens(config, code);
    await saveConnectionFromTokens({
      organizationId: statePayload.organizationId,
      tokens,
      connectedById: session.user.id,
    });

    const successUrl = new URL("/zoho", request.url);
    successUrl.searchParams.set("connected", "1");
    const response = NextResponse.redirect(successUrl);
    response.cookies.delete("zoho_oauth_state");
    return response;
  } catch (err) {
    logger.warn({ err }, "Zoho OAuth callback failed");
    const { body } = toApiError(err);
    return redirectWithError(request, body.error.message);
  }
}
