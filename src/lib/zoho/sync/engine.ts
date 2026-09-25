import { prisma } from "@/lib/db";
import type { Prisma, SyncEntityType, SyncTrigger } from "@/generated/prisma/client";
import type { ZohoApiClient } from "@/lib/zoho/client/zohoApiClient";
import { paginate } from "@/lib/zoho/client/pagination";
import { safeErrorMessage } from "@/lib/zoho/redact";
import type { SyncRunResult, ZohoPage } from "@/lib/zoho/types";
import { logger } from "@/lib/logging";

type PrismaTx = Prisma.TransactionClient;

export type PersistResult = { created: boolean } | { skipped: true; reason: string };

export interface EntitySyncConfig<TRaw, TItem = TRaw> {
  entityType: SyncEntityType;
  /** Fetches one raw (unvalidated) page from the relevant Zoho list endpoint. */
  fetchPage: (client: ZohoApiClient, page: number) => Promise<ZohoPage<unknown>>;
  /** Zod (or equivalent) parse — throws on an unexpected shape. Pure, no I/O. */
  validate: (raw: unknown) => TRaw;
  /**
   * Optional per-record network enrichment (e.g. fetching a Purchase
   * Order's line items via its detail endpoint). Runs OUTSIDE any DB
   * transaction — see requirement #21.
   */
  enrich?: (client: ZohoApiClient, raw: TRaw) => Promise<TItem>;
  /** DB-only persistence (idempotent upsert). No network calls allowed inside. */
  persist: (tx: PrismaTx, item: TItem) => Promise<PersistResult>;
}

export interface RunSyncOptions {
  client: ZohoApiClient;
  triggerType: SyncTrigger;
  triggeredByUserId?: string | null;
}

const MAX_STORED_ERROR_LINES = 50;
const MAX_ERROR_DETAILS_LENGTH = 8_000;

/**
 * Runs one full entity sync: paginates the Zoho list endpoint, validates
 * and (optionally) enriches each record over the network, then persists
 * each page in its own short DB transaction — never holding a transaction
 * open across a network call (requirement #21). Every operation is an
 * idempotent upsert, so a run that fails partway through (e.g. page 3 of 5)
 * is always safe to simply re-run from the start: pages already processed
 * just get re-upserted to the same values, never duplicated (requirement
 * #12). `lastPageCursor` records how far a run got for observability, not
 * as a skip-ahead checkpoint — see docs/architecture.md "Resumable
 * Synchronization" for why that's the safest behavior without a schema
 * change.
 */
export async function runEntitySync<TRaw, TItem = TRaw>(
  config: EntitySyncConfig<TRaw, TItem>,
  options: RunSyncOptions,
): Promise<SyncRunResult> {
  const syncLog = await prisma.syncLog.create({
    data: {
      syncEntityType: config.entityType,
      status: "RUNNING",
      triggerType: options.triggerType,
      triggeredByUserId: options.triggeredByUserId ?? undefined,
    },
  });

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errorLines: string[] = [];

  function recordFailure(stage: "validate" | "enrich" | "persist", err: unknown): void {
    failed += 1;
    if (errorLines.length < MAX_STORED_ERROR_LINES) {
      errorLines.push(`[${stage}] ${safeErrorMessage(err)}`);
    }
    logger.warn(
      { syncLogId: syncLog.id, entityType: config.entityType, stage },
      "Zoho sync record failure",
    );
  }

  async function finalize(
    status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED",
  ): Promise<SyncRunResult> {
    const errorDetails =
      errorLines.length > 0 ? errorLines.join("\n").slice(0, MAX_ERROR_DETAILS_LENGTH) : null;
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status,
        runEndedAt: new Date(),
        recordsProcessed: processed,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsFailed: failed,
        errorDetails,
      },
    });
    return { syncLogId: syncLog.id, status, processed, created, updated, failed };
  }

  try {
    let page = 1;
    for await (const rawPageItems of paginate((p) => config.fetchPage(options.client, p))) {
      // Validate — pure, no I/O.
      const validated: TRaw[] = [];
      for (const raw of rawPageItems) {
        processed += 1;
        try {
          validated.push(config.validate(raw));
        } catch (err) {
          recordFailure("validate", err);
        }
      }

      // Enrich — network only, deliberately outside the DB transaction below.
      const ready: TItem[] = [];
      for (const item of validated) {
        try {
          ready.push(
            config.enrich ? await config.enrich(options.client, item) : (item as unknown as TItem),
          );
        } catch (err) {
          recordFailure("enrich", err);
        }
      }

      // Persist — DB only, short-lived transaction, no network inside.
      await prisma.$transaction(async (tx) => {
        for (const item of ready) {
          try {
            const result = await config.persist(tx, item);
            if ("skipped" in result) {
              recordFailure("persist", new Error(result.reason));
            } else if (result.created) {
              created += 1;
            } else {
              updated += 1;
            }
          } catch (err) {
            recordFailure("persist", err);
          }
        }
      });

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          lastPageCursor: String(page),
          recordsProcessed: processed,
          recordsCreated: created,
          recordsUpdated: updated,
          recordsFailed: failed,
        },
      });
      page += 1;
    }

    return await finalize(failed > 0 ? "PARTIAL_SUCCESS" : "SUCCESS");
  } catch (err) {
    errorLines.push(`[fatal] ${safeErrorMessage(err)}`);
    logger.error(
      { syncLogId: syncLog.id, entityType: config.entityType, err },
      "Zoho sync run failed",
    );
    return finalize("FAILED");
  }
}
