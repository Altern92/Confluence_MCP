import { resolvePaginationInfo } from "../confluence/pagination.js";
import type { ConfluencePageSummary, ConfluenceSpaceSummary } from "../confluence/types.js";
import type { ConfluenceClient } from "../confluence/client.js";
import type { ChunkingOptions } from "./chunking.js";
import type { ConfluencePageLoader, LoadedPageForSync } from "./confluence-page-loader.js";
import type { PreparedPageSyncResult } from "./page-sync-coordinator.js";
import type { SemanticIndexer } from "../retrieval/semantic-indexer.js";
import type { AppConfig } from "../config.js";
import { resolvePermittedSpaceKeys } from "../security/access-policy.js";
import type { DocumentIndexStore, SyncStateStore } from "./storage-ports.js";
import type { ReindexReason, SyncRunRecord } from "./sync-types.js";

const DEFAULT_SPACE_PAGE_LIMIT = 50;
const DEFAULT_SPACE_CONTENT_PAGE_LIMIT = 100;

function normalizeAllowlist(allowlist?: string[]) {
  return new Set((allowlist ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean));
}

function extractSpaceId(space: ConfluenceSpaceSummary) {
  if (space.id == null) {
    return null;
  }

  return String(space.id);
}

function extractSpaceKey(space: ConfluenceSpaceSummary) {
  if (!space.key) {
    return null;
  }

  return space.key.trim() || null;
}

function extractPageId(page: ConfluencePageSummary) {
  if (page.id == null) {
    return null;
  }

  return String(page.id);
}

function mapEligibleSpaces(spaces: ConfluenceSpaceSummary[], allowlist?: string[]) {
  const allowed = normalizeAllowlist(allowlist);

  return spaces
    .map((space) => {
      const id = extractSpaceId(space);
      const key = extractSpaceKey(space);

      if (!id || !key) {
        return null;
      }

      if (allowed.size > 0 && !allowed.has(key.toUpperCase())) {
        return null;
      }

      return {
        id,
        key,
        name: space.name?.trim() || null,
      };
    })
    .filter((space): space is { id: string; key: string; name: string | null } => space != null);
}

export function mapEligibleSpaceKeys(spaces: ConfluenceSpaceSummary[], allowlist?: string[]) {
  const allowed = normalizeAllowlist(allowlist);

  return spaces
    .map(extractSpaceKey)
    .filter((spaceKey): spaceKey is string => Boolean(spaceKey))
    .filter((spaceKey) => allowed.size === 0 || allowed.has(spaceKey.toUpperCase()));
}

export type FullSyncInput = {
  tenantId?: string | null;
  spaceKeys?: string[];
  maxSpaces?: number;
  maxPagesPerSpace?: number;
  chunking?: ChunkingOptions;
  reason?: ReindexReason;
};

export type PreparedFullSyncResult = {
  run: SyncRunRecord;
  spaceRuns: SyncRunRecord[];
  processedSpaceKeys: string[];
};

type SpacesClientPort = Pick<ConfluenceClient, "getSpaces" | "getSpacePages">;
type PageLoaderPort = Pick<ConfluencePageLoader, "loadPageForSync">;
type PageSyncCoordinatorPort = {
  syncPage(
    input: LoadedPageForSync & { reason: ReindexReason; chunking?: ChunkingOptions },
  ): Promise<PreparedPageSyncResult>;
};
type IndexStorePort = Pick<DocumentIndexStore, "deleteDocumentsMissingFromSpace">;

type EligibleSpace = ReturnType<typeof mapEligibleSpaces>[number];

type PreparedSpaceFullSyncResult = {
  run: SyncRunRecord;
  processedPageIds: string[];
  snapshotComplete: boolean;
};

export class FullSyncCoordinator {
  constructor(
    private readonly config: Pick<AppConfig, "policy">,
    private readonly client: SpacesClientPort,
    private readonly pageLoader: PageLoaderPort,
    private readonly pageSyncCoordinator: PageSyncCoordinatorPort,
    private readonly stateStore: SyncStateStore,
    private readonly indexStore: IndexStorePort,
    private readonly semanticIndexer?: Pick<SemanticIndexer, "removePages">,
  ) {}

  async syncAll(input: FullSyncInput = {}): Promise<PreparedFullSyncResult> {
    const reason = input.reason ?? "bootstrap";
    const permittedSpaceKeys = resolvePermittedSpaceKeys(this.config, input.spaceKeys);
    const queuedRun = this.stateStore.createFullReindexRun(reason);
    this.stateStore.markRunRunning(queuedRun.runId);

    const processedSpaceKeys: string[] = [];
    const spaceRuns: SyncRunRecord[] = [];
    const maxSpaces = input.maxSpaces ?? Number.POSITIVE_INFINITY;
    let cursor: string | undefined;
    let pagesDiscovered = 0;
    let pagesIndexed = 0;
    let pagesDeleted = 0;
    let chunksProduced = 0;

    try {
      while (processedSpaceKeys.length < maxSpaces) {
        const response = await this.client.getSpaces({
          limit: DEFAULT_SPACE_PAGE_LIMIT,
          cursor,
        });
        const spaces = mapEligibleSpaces(response.results ?? [], permittedSpaceKeys);

        for (const space of spaces) {
          if (processedSpaceKeys.length >= maxSpaces) {
            break;
          }

          const result = await this.syncSpace(space, {
            tenantId: input.tenantId ?? null,
            reason,
            maxPagesPerSpace: input.maxPagesPerSpace,
            chunking: input.chunking,
          });

          processedSpaceKeys.push(space.key);
          spaceRuns.push(result.run);

          if (result.run.stats) {
            pagesDiscovered += result.run.stats.pagesDiscovered;
            pagesIndexed += result.run.stats.pagesIndexed;
            pagesDeleted += result.run.stats.pagesDeleted;
            chunksProduced += result.run.stats.chunksProduced;
          }
        }

        const nextCursor = resolvePaginationInfo({ links: response._links }).nextCursor;

        if (!nextCursor || processedSpaceKeys.length >= maxSpaces) {
          break;
        }

        cursor = nextCursor;
      }

      const run = this.stateStore.markRunSucceeded(queuedRun.runId, {
        pagesDiscovered,
        pagesIndexed,
        pagesDeleted,
        chunksProduced,
      });

      return {
        run,
        spaceRuns,
        processedSpaceKeys,
      };
    } catch (error) {
      this.stateStore.markRunFailed(
        queuedRun.runId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async syncSpace(
    space: EligibleSpace,
    options: {
      tenantId: string | null;
      reason: ReindexReason;
      maxPagesPerSpace?: number;
      chunking?: ChunkingOptions;
    },
  ): Promise<PreparedSpaceFullSyncResult> {
    const queuedRun = this.stateStore.createSpaceReindexRun(space.key, options.reason);
    this.stateStore.markRunRunning(queuedRun.runId);

    const pageLimit = options.maxPagesPerSpace ?? Number.POSITIVE_INFINITY;
    const retainedPageIds = new Set<string>();
    const seenPageIds = new Set<string>();
    const processedPageIds: string[] = [];
    let cursor: string | undefined;
    let pagesDiscovered = 0;
    let pagesIndexed = 0;
    let pagesDeleted = 0;
    let chunksProduced = 0;
    let snapshotComplete = true;

    try {
      while (pagesDiscovered < pageLimit) {
        const remainingPages = pageLimit - pagesDiscovered;
        const response = await this.client.getSpacePages(space.id, {
          limit: Math.min(DEFAULT_SPACE_CONTENT_PAGE_LIMIT, remainingPages),
          cursor,
        });

        for (const page of response.results ?? []) {
          const pageId = extractPageId(page);

          if (!pageId || seenPageIds.has(pageId)) {
            continue;
          }

          seenPageIds.add(pageId);
          retainedPageIds.add(pageId);
          processedPageIds.push(pageId);
          pagesDiscovered += 1;

          const loadedPage = await this.pageLoader.loadPageForSync({
            pageId,
            spaceKey: space.key,
            tenantId: options.tenantId,
          });
          const pageSyncResult = await this.pageSyncCoordinator.syncPage({
            ...loadedPage,
            reason: options.reason,
            chunking: options.chunking,
          });

          pagesIndexed += pageSyncResult.run.stats?.pagesIndexed ?? 1;
          chunksProduced +=
            pageSyncResult.run.stats?.chunksProduced ?? pageSyncResult.chunks.length;
        }

        const nextCursor = resolvePaginationInfo({ links: response._links }).nextCursor;

        if (!nextCursor || (response.results?.length ?? 0) === 0) {
          break;
        }

        if (pagesDiscovered >= pageLimit) {
          snapshotComplete = false;
          break;
        }

        cursor = nextCursor;
      }

      if (snapshotComplete) {
        const removedRecords = this.indexStore.deleteDocumentsMissingFromSpace(
          space.key,
          retainedPageIds,
        );
        pagesDeleted = removedRecords.length;
        await this.semanticIndexer?.removePages(removedRecords.map((record) => record.pageId));
      }

      const run = this.stateStore.markRunSucceeded(queuedRun.runId, {
        pagesDiscovered,
        pagesIndexed,
        pagesDeleted,
        chunksProduced,
      });

      return {
        run,
        processedPageIds,
        snapshotComplete,
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
