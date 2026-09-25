import { getValidAccessToken } from "@/lib/zoho/auth/connection";
import {
  createZohoApiClient,
  type ZohoApiClient,
  type ZohoClientDeps,
} from "@/lib/zoho/client/zohoApiClient";

export type ConnectedClientOptions = Pick<
  ZohoClientDeps,
  "fetchImpl" | "timeoutMs" | "maxRetries" | "backoffBaseMs"
>;

/**
 * Builds a ready-to-use Zoho API client backed by the stored, encrypted
 * connection — this is the only place that wires DB-backed token
 * management (auth/connection.ts) into the otherwise-pure HTTP client
 * (client/zohoApiClient.ts), so the client itself stays trivially testable
 * with a fake token provider and no database.
 */
export async function createConnectedZohoClient(
  options: ConnectedClientOptions = {},
): Promise<ZohoApiClient> {
  let resolved = await getValidAccessToken();

  return createZohoApiClient({
    apiBaseUrl: resolved.apiDomain,
    organizationId: resolved.zohoOrganizationId,
    getAccessToken: async () => resolved.accessToken,
    refreshAccessToken: async () => {
      resolved = await getValidAccessToken({ forceRefresh: true });
      return resolved.accessToken;
    },
    ...options,
  });
}
