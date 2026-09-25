import { describe, it, expect, vi } from "vitest";
import { paginate, fetchZohoListPage } from "@/lib/zoho/client/pagination";
import { ZohoMalformedResponseError } from "@/lib/zoho/errors";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";

describe("paginate()", () => {
  it("stops after a single page when hasMorePage is false", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1, 2, 3], hasMorePage: false }));
    const pages: number[][] = [];
    for await (const page of paginate(fetchPage)) pages.push(page as number[]);
    expect(pages).toEqual([[1, 2, 3]]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("walks every page across a multi-page response", async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) return { items: ["a", "b"], hasMorePage: true };
      if (page === 2) return { items: ["c"], hasMorePage: true };
      return { items: ["d"], hasMorePage: false };
    });
    const pages: string[][] = [];
    for await (const page of paginate(fetchPage)) pages.push(page as string[]);
    expect(pages).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("handles an empty first page", async () => {
    const fetchPage = vi.fn(async () => ({ items: [], hasMorePage: false }));
    const pages: unknown[][] = [];
    for await (const page of paginate(fetchPage)) pages.push(page);
    expect(pages).toEqual([[]]);
  });

  it("propagates a failure on a later page without silently stopping", async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) return { items: [1], hasMorePage: true };
      if (page === 2) return { items: [2], hasMorePage: true };
      throw new Error("page 3 network failure");
    });

    const seen: unknown[] = [];
    await expect(
      (async () => {
        for await (const page of paginate(fetchPage)) seen.push(...page);
      })(),
    ).rejects.toThrow("page 3 network failure");
    // Pages 1 and 2 were yielded before the failure — nothing was silently dropped.
    expect(seen).toEqual([1, 2]);
  });
});

describe("fetchZohoListPage()", () => {
  function fakeClient(response: unknown): ZohoApiClient {
    return {
      organizationId: "org-1",
      request: vi.fn(async () => response) as unknown as ZohoApiClient["request"],
    };
  }

  it("normalizes a Zoho list envelope into ZohoPage", async () => {
    const client = fakeClient({ items: [{ item_id: "1" }], page_context: { has_more_page: true } });
    const result = await fetchZohoListPage(client, "/items", "items", 1);
    expect(result.items).toHaveLength(1);
    expect(result.hasMorePage).toBe(true);
  });

  it("treats a missing page_context as no more pages", async () => {
    const client = fakeClient({ items: [] });
    const result = await fetchZohoListPage(client, "/items", "items", 1);
    expect(result.hasMorePage).toBe(false);
  });

  it("throws ZohoMalformedResponseError when the expected array key is missing", async () => {
    const client = fakeClient({ unexpectedKey: [] });
    await expect(fetchZohoListPage(client, "/items", "items", 1)).rejects.toBeInstanceOf(
      ZohoMalformedResponseError,
    );
  });

  it("passes extra query params through (e.g. contact_type=vendor)", async () => {
    const request = vi.fn(async () => ({ contacts: [], page_context: { has_more_page: false } }));
    const client: ZohoApiClient = {
      organizationId: "org-1",
      request: request as unknown as ZohoApiClient["request"],
    };
    await fetchZohoListPage(client, "/contacts", "contacts", 1, {
      query: { contact_type: "vendor" },
    });
    expect(request).toHaveBeenCalledWith(
      "/contacts",
      expect.objectContaining({ query: expect.objectContaining({ contact_type: "vendor" }) }),
    );
  });
});
