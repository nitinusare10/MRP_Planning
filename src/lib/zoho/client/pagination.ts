import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { ZohoMalformedResponseError } from "@/lib/zoho/errors";
import type { ZohoPage } from "@/lib/zoho/types";

export type PageFetcher<TRaw> = (page: number) => Promise<ZohoPage<TRaw>>;

interface ZohoListEnvelope {
  page_context?: { has_more_page?: boolean };
  [arrayKey: string]: unknown;
}

/**
 * Fetches one page of a Zoho Inventory list endpoint. Every list endpoint
 * wraps its array under a different key (`items`, `vendors`, `warehouses`,
 * `purchaseorders`, ...) and reports more-pages via `page_context.has_more_page`
 * — this normalizes both into the shared ZohoPage<T> shape.
 */
export async function fetchZohoListPage<TRaw>(
  client: ZohoApiClient,
  path: string,
  arrayKey: string,
  page: number,
  options: { perPage?: number; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<ZohoPage<TRaw>> {
  const json = await client.request<ZohoListEnvelope>(path, {
    query: { page, per_page: options.perPage ?? 200, ...options.query },
  });
  const items = json[arrayKey];
  if (!Array.isArray(items)) {
    throw new ZohoMalformedResponseError(
      `Expected a "${arrayKey}" array in the response from ${path}.`,
    );
  }
  return { items: items as TRaw[], hasMorePage: Boolean(json.page_context?.has_more_page) };
}

/** Safety cap so a buggy/malicious `hasMorePage: true` forever can't loop forever. */
const MAX_PAGES = 10_000;

/**
 * Lazily walks every page of a Zoho list endpoint, yielding one page's raw
 * items at a time. A caller that stops iterating (e.g. after catching an
 * error on page 3) simply never fetches page 4 — there's nothing to cancel.
 */
export async function* paginate<TRaw>(
  fetchPage: PageFetcher<TRaw>,
): AsyncGenerator<TRaw[], void, unknown> {
  let page = 1;
  while (page <= MAX_PAGES) {
    const result = await fetchPage(page);
    yield result.items;
    if (!result.hasMorePage) {
      return;
    }
    page += 1;
  }
  throw new Error(
    `Zoho pagination exceeded ${MAX_PAGES} pages — aborting to avoid an infinite loop.`,
  );
}
