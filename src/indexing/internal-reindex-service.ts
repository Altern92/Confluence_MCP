import type { AppConfig } from "../config.js";
import { resolvePermittedSpaceKeys, assertSpaceAllowed } from "../security/access-policy.js";
import type { BodyFormat } from "../types/tool-schemas.js";
import type { ChunkingOptions } from "./chunking.js";
import type { LoadedPageForSync } from "./confluence-page-loader.js";
import type { PreparedFullSyncResult } from "./full-sync-coordinator.js";
import type { PreparedPageSyncResult } from "./page-sync-coordinator.js";
import type { ReindexReason } from "./sync-types.js";

type PageLoaderPort = {
  loadPageForSync(input: {
    pageId: string;
    spaceKey?: string | null;
    tenantId?: string | null;
    bodyFormat?: BodyFormat;
  }): Promise<LoadedPageForSync>;
};

type PageSyncCoordinatorPort = {
  syncPage(
    input: LoadedPageForSync & {
      reason: ReindexReason;
      chunking?: ChunkingOptions;
    },
  ): Promise<PreparedPageSyncResult>;
};

type FullSyncCoordinatorPort = {
  syncAll(input?: {
    tenantId?: string | null;
    spaceKeys?: string[];
    maxSpaces?: number;
    maxPagesPerSpace?: number;
    chunking?: ChunkingOptions;
    reason?: ReindexReason;
  }): Promise<PreparedFullSyncResult>;
};

export type InternalReindexPageInput = {
  pageId: string;
  spaceKey?: string | null;
  tenantId?: string | null;
  bodyFormat?: BodyFormat;
  chunking?: ChunkingOptions;
  reason?: ReindexReason;
};

export type InternalReindexSpaceInput = {
  spaceKey: string;
  tenantId?: string | null;
  maxPagesPerSpace?: number;
  chunking?: ChunkingOptions;
  reason?: ReindexReason;
};

export type InternalFullReindexInput = {
  tenantId?: string | null;
  spaceKeys?: string[];
  maxSpaces?: number;
  maxPagesPerSpace?: number;
  chunking?: ChunkingOptions;
  reason?: ReindexReason;
};

export class InternalReindexService {
  constructor(
    private readonly config: Pick<AppConfig, "indexing" | "policy">,
    private readonly pageLoader: PageLoaderPort,
    private readonly pageSyncCoordinator: PageSyncCoordinatorPort,
    private readonly fullSyncCoordinator: FullSyncCoordinatorPort,
  ) {}

  async reindexPage(input: InternalReindexPageInput): Promise<PreparedPageSyncResult> {
    const loadedPage = await this.pageLoader.loadPageForSync({
      pageId: input.pageId,
      spaceKey: input.spaceKey,
      tenantId: input.tenantId ?? this.config.indexing?.tenantId ?? null,
      bodyFormat: input.bodyFormat,
    });

    return this.pageSyncCoordinator.syncPage({
      ...loadedPage,
      reason: input.reason ?? "manual",
      chunking: input.chunking ?? this.config.indexing?.chunking,
    });
  }

  async reindexSpace(input: InternalReindexSpaceInput): Promise<PreparedFullSyncResult> {
    assertSpaceAllowed(this.config, input.spaceKey, "Space reindex");

    return this.fullSyncCoordinator.syncAll({
      tenantId: input.tenantId ?? this.config.indexing?.tenantId ?? null,
      spaceKeys: [input.spaceKey],
      maxPagesPerSpace: input.maxPagesPerSpace ?? this.config.indexing?.sync.maxPagesPerSpace,
      chunking: input.chunking ?? this.config.indexing?.chunking,
      reason: input.reason ?? "manual",
    });
  }

  async fullReindex(input: InternalFullReindexInput = {}): Promise<PreparedFullSyncResult> {
    const permittedSpaceKeys = resolvePermittedSpaceKeys(this.config, input.spaceKeys);

    return this.fullSyncCoordinator.syncAll({
      tenantId: input.tenantId ?? this.config.indexing?.tenantId ?? null,
      spaceKeys: permittedSpaceKeys,
      maxSpaces: input.maxSpaces,
      maxPagesPerSpace: input.maxPagesPerSpace ?? this.config.indexing?.sync.maxPagesPerSpace,
      chunking: input.chunking ?? this.config.indexing?.chunking,
      reason: input.reason ?? "manual",
    });
  }
}
