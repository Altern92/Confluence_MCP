import type { AppConfig } from "../config.js";
import type { VectorStore } from "../retrieval/vector-store.js";
import type { DocumentIndexStore, SyncStateStore } from "./storage-ports.js";
import type {
  IncrementalSyncRunSummary,
  IncrementalSyncWorker,
} from "./incremental-sync-worker.js";
import type { SyncRunRecord, SyncWatermark } from "./sync-types.js";

export type SyncStatusSnapshot = {
  worker: {
    enabled: boolean;
    hasActiveRun: boolean;
    completedRunCount: number;
    configuredSpaceKeys: string[];
    pollIntervalMs: number | null;
    maxPagesPerSpace: number | null;
    runOnStartup: boolean | null;
    fullReconcile: {
      enabled: boolean;
      intervalRuns: number | null;
      runOnStartup: boolean | null;
    };
    lastRunSummary: IncrementalSyncRunSummary | null;
  };
  index: {
    documentCount: number;
    chunkCount: number;
    vectorRecordCount: number | null;
    spaces: Array<{
      spaceKey: string | null;
      documentCount: number;
      chunkCount: number;
    }>;
  };
  watermarks: SyncWatermark[];
  recentRuns: SyncRunRecord[];
};

type SyncStateStorePort = Pick<SyncStateStore, "listRuns" | "listWatermarks">;
type IndexStorePort = Pick<
  DocumentIndexStore,
  "countChunks" | "countDocuments" | "listPageDocuments"
>;
type VectorStorePort = Pick<VectorStore, "count">;
type IncrementalSyncWorkerPort = Pick<
  IncrementalSyncWorker,
  "getConfiguredSpaceKeys" | "getStatusSnapshot" | "isEnabled"
>;

function groupIndexBySpace(indexStore: IndexStorePort) {
  const grouped = new Map<string | null, { documentCount: number; chunkCount: number }>();

  for (const record of indexStore.listPageDocuments()) {
    const key = record.document.spaceKey ?? null;
    const current = grouped.get(key) ?? {
      documentCount: 0,
      chunkCount: 0,
    };

    current.documentCount += 1;
    current.chunkCount += record.chunks.length;
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([spaceKey, stats]) => ({
      spaceKey,
      documentCount: stats.documentCount,
      chunkCount: stats.chunkCount,
    }))
    .sort((left, right) => {
      const leftKey = left.spaceKey ?? "";
      const rightKey = right.spaceKey ?? "";

      return leftKey.localeCompare(rightKey);
    });
}

export async function buildSyncStatusSnapshot(input: {
  config: AppConfig;
  stateStore: SyncStateStorePort;
  indexStore: IndexStorePort;
  worker: IncrementalSyncWorkerPort;
  vectorStore?: VectorStorePort | null;
  recentRunLimit?: number;
}): Promise<SyncStatusSnapshot> {
  const recentRunLimit = input.recentRunLimit ?? 20;
  const workerStatus = input.worker.getStatusSnapshot();

  return {
    worker: {
      enabled: input.worker.isEnabled(),
      hasActiveRun: workerStatus.hasActiveRun,
      completedRunCount: workerStatus.completedRunCount,
      configuredSpaceKeys: input.worker.getConfiguredSpaceKeys(),
      pollIntervalMs: input.config.indexing?.sync.pollIntervalMs ?? null,
      maxPagesPerSpace: input.config.indexing?.sync.maxPagesPerSpace ?? null,
      runOnStartup: input.config.indexing?.sync.runOnStartup ?? null,
      fullReconcile: {
        enabled: input.config.indexing?.sync.fullReconcile.enabled ?? false,
        intervalRuns: input.config.indexing?.sync.fullReconcile.intervalRuns ?? null,
        runOnStartup: input.config.indexing?.sync.fullReconcile.runOnStartup ?? null,
      },
      lastRunSummary: workerStatus.lastRunSummary,
    },
    index: {
      documentCount: input.indexStore.countDocuments(),
      chunkCount: input.indexStore.countChunks(),
      vectorRecordCount: input.vectorStore ? await input.vectorStore.count() : null,
      spaces: groupIndexBySpace(input.indexStore),
    },
    watermarks: input.stateStore.listWatermarks(),
    recentRuns: input.stateStore.listRuns().slice(0, recentRunLimit),
  };
}
