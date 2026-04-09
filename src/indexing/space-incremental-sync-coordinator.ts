import { buildIncrementalSyncCql } from "../confluence/cql.js";
import { resolvePaginationInfo } from "../confluence/pagination.js";
import type { ConfluenceSearchResult } from "../confluence/types.js";
import type { ConfluenceClient } from "../confluence/client.js";
import type { ChunkingOptions } from "./chunking.js";
import type { ConfluencePageLoader, LoadedPageForSync } from "./confluence-page-loader.js";
import type { PreparedPageSyncResult } from "./page-sync-coordinator.js";
import type { SyncStateStore } from "./storage-ports.js";
import type { ReindexReason, SyncRunRecord, SyncWatermark } from "./sync-types.js";

const DEFAULT_INCREMENTAL_SYNC_LIMIT = 50;
const DEFAULT_INCREMENTAL_SYNC_START = "1970-01-01T00:00:00Z";

function extractPageIdFromSearchHit(result: ConfluenceSearchResult): string | null {
  const pageId = result.content?.id ?? result.id;

  if (pageId == null) {
    return null;
  }

  return String(pageId);
}

function extractSpaceKeyFromSearchHit(result: ConfluenceSearchResult): string | null {
  return result.content?.space?.key ?? result.space?.key ?? null;
}

function pickLatestIsoTimestamp(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left.localeCompare(right) >= 0 ? left : right;
}

export type SpaceIncrementalSyncInput = {
  spaceKey: string;
  since?: string | null;
  tenantId?: string | null;
  reason?: ReindexReason;
  limit?: number;
  maxPages?: number;
  chunking?: ChunkingOptions;
};

export type PreparedSpaceIncrementalSyncResult = {
  run: SyncRunRecord;
  pageRuns: SyncRunRecord[];
  watermark: SyncWatermark | null;
  startedFrom: string;
};

type SearchClientPort = Pick<ConfluenceClient, "search">;
type PageLoaderPort = Pick<ConfluencePageLoader, "loadPageForSync">;
type PageSyncCoordinatorPort = {
  syncPage(
    input: LoadedPageForSync & { reason: ReindexReason; chunking?: ChunkingOptions },
  ): Promise<PreparedPageSyncResult>;
};

export class SpaceIncrementalSyncCoordinator {
  constructor(
    private readonly searchClient: SearchClientPort,
    private readonly pageLoader: PageLoaderPort,
    private readonly pageSyncCoordinator: PageSyncCoordinatorPort,
    private readonly stateStore: SyncStateStore,
  ) {}

  async syncSpace(input: SpaceIncrementalSyncInput): Promise<PreparedSpaceIncrementalSyncResult> {
    const reason = input.reason ?? "content_changed";
    const scopeKey = `space:${input.spaceKey}`;
    const startedFrom =
      input.since ??
      this.stateStore.getWatermark(scopeKey)?.lastModified ??
      DEFAULT_INCREMENTAL_SYNC_START;
    const queuedRun = this.stateStore.createSpaceReindexRun(input.spaceKey, reason);
    this.stateStore.markRunRunning(queuedRun.runId);

    let latestModified: string | null = startedFrom;
    let pagesDiscovered = 0;
    let pagesIndexed = 0;
    let chunksProduced = 0;
    let cursor: string | undefined;
    const pageRuns: SyncRunRecord[] = [];
    const seenPageIds = new Set<string>();
    const pageLimit = input.maxPages ?? Number.POSITIVE_INFINITY;

    try {
      while (pagesDiscovered < pageLimit) {
        const cql = buildIncrementalSyncCql({
          spaceKey: input.spaceKey,
          updatedAfter: startedFrom,
        });
        const response = await this.searchClient.search(
          cql,
          Math.min(input.limit ?? DEFAULT_INCREMENTAL_SYNC_LIMIT, pageLimit - pagesDiscovered),
          cursor,
        );

        for (const result of response.results) {
          const pageId = extractPageIdFromSearchHit(result);

          if (!pageId || seenPageIds.has(pageId)) {
            continue;
          }

          seenPageIds.add(pageId);
          pagesDiscovered += 1;

          const loadedPage = await this.pageLoader.loadPageForSync({
            pageId,
            spaceKey: extractSpaceKeyFromSearchHit(result) ?? input.spaceKey,
            tenantId: input.tenantId ?? null,
          });
          const pageSyncResult = await this.pageSyncCoordinator.syncPage({
            ...loadedPage,
            reason,
            chunking: input.chunking,
          });

          pageRuns.push(pageSyncResult.run);
          pagesIndexed += pageSyncResult.run.stats?.pagesIndexed ?? 1;
          chunksProduced +=
            pageSyncResult.run.stats?.chunksProduced ?? pageSyncResult.chunks.length;
          latestModified = pickLatestIsoTimestamp(
            latestModified,
            pageSyncResult.document.lastModified,
          );

          if (pagesDiscovered >= pageLimit) {
            break;
          }
        }

        const nextCursor = resolvePaginationInfo({ links: response._links }).nextCursor;

        if (!nextCursor || response.results.length === 0 || pagesDiscovered >= pageLimit) {
          break;
        }

        cursor = nextCursor;
      }

      const run = this.stateStore.markRunSucceeded(queuedRun.runId, {
        pagesDiscovered,
        pagesIndexed,
        pagesDeleted: 0,
        chunksProduced,
      });
      const watermark = latestModified
        ? this.stateStore.upsertWatermark(scopeKey, latestModified)
        : this.stateStore.getWatermark(scopeKey);

      return {
        run,
        pageRuns,
        watermark,
        startedFrom,
      };
    } catch (error) {
      this.stateStore.markRunFailed(
        queuedRun.runId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}

export { extractPageIdFromSearchHit, extractSpaceKeyFromSearchHit };
