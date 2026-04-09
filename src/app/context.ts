import type { AppConfig } from "../config.js";
import { loadConfig, validateAppConfig } from "../config.js";
import { ConfluenceClient } from "../confluence/client.js";
import {
  ConfluenceContentService,
  type ConfluenceContentServicePort,
} from "../domain/confluence-content-service.js";
import { ConfluencePageLoader } from "../indexing/confluence-page-loader.js";
import { createIndexingStores } from "../indexing/create-indexing-stores.js";
import { FullSyncCoordinator } from "../indexing/full-sync-coordinator.js";
import { IncrementalSyncWorker } from "../indexing/incremental-sync-worker.js";
import { InternalReindexService } from "../indexing/internal-reindex-service.js";
import { PageSyncCoordinator } from "../indexing/page-sync-coordinator.js";
import { SpaceIncrementalSyncCoordinator } from "../indexing/space-incremental-sync-coordinator.js";
import type { DocumentIndexStore, SyncStateStore } from "../indexing/storage-ports.js";
import { createLogger, type Logger } from "../logging/logger.js";
import { MetricsRegistry } from "../observability/metrics-registry.js";
import { createRetrievalComponents } from "../retrieval/create-retrieval.js";
import type { EmbeddingService } from "../retrieval/embedding-service.js";
import { SemanticIndexer } from "../retrieval/semantic-indexer.js";
import type { VectorStore } from "../retrieval/vector-store.js";

export type AppContext = {
  config: AppConfig;
  logger: Logger;
  metrics: MetricsRegistry;
  confluenceClient: ConfluenceClient;
  contentService: ConfluenceContentServicePort;
  indexingStoreDriver: "memory" | "file";
  indexingStoragePath: string | null;
  syncStateStore: SyncStateStore;
  indexStore: DocumentIndexStore;
  semanticRetrievalEnabled: boolean;
  embeddingService: EmbeddingService | null;
  vectorStore: VectorStore | null;
  semanticIndexer: SemanticIndexer | null;
  pageLoader: ConfluencePageLoader;
  pageSyncCoordinator: PageSyncCoordinator;
  spaceIncrementalSyncCoordinator: SpaceIncrementalSyncCoordinator;
  fullSyncCoordinator: FullSyncCoordinator;
  internalReindexService: InternalReindexService;
  incrementalSyncWorker: IncrementalSyncWorker;
};

export function createAppContext(config: AppConfig = loadConfig()): AppContext {
  validateAppConfig(config);

  const logger = createLogger(config.logLevel);
  const metrics = new MetricsRegistry();
  const confluenceClient = new ConfluenceClient({ config, logger, metrics });
  const retrievalComponents = createRetrievalComponents(config);
  const contentService = new ConfluenceContentService({
    config,
    confluenceClient,
    metrics,
    semanticIndexer: retrievalComponents.semanticIndexer,
  });
  const indexingStores = createIndexingStores(config);
  const syncStateStore = indexingStores.syncStateStore;
  const indexStore = indexingStores.indexStore;
  const pageLoader = new ConfluencePageLoader(contentService);
  const pageSyncCoordinator = new PageSyncCoordinator(
    syncStateStore,
    indexStore,
    retrievalComponents.semanticIndexer ?? undefined,
  );
  const spaceIncrementalSyncCoordinator = new SpaceIncrementalSyncCoordinator(
    confluenceClient,
    pageLoader,
    pageSyncCoordinator,
    syncStateStore,
  );
  const fullSyncCoordinator = new FullSyncCoordinator(
    config,
    confluenceClient,
    pageLoader,
    pageSyncCoordinator,
    syncStateStore,
    indexStore,
    retrievalComponents.semanticIndexer ?? undefined,
  );
  const internalReindexService = new InternalReindexService(
    config,
    pageLoader,
    pageSyncCoordinator,
    fullSyncCoordinator,
  );
  const incrementalSyncWorker = new IncrementalSyncWorker(
    config,
    logger,
    metrics,
    spaceIncrementalSyncCoordinator,
    fullSyncCoordinator,
  );

  return {
    config,
    logger,
    metrics,
    confluenceClient,
    contentService,
    indexingStoreDriver: indexingStores.driver,
    indexingStoragePath: indexingStores.storagePath,
    syncStateStore,
    indexStore,
    semanticRetrievalEnabled: retrievalComponents.enabled,
    embeddingService: retrievalComponents.embeddingService,
    vectorStore: retrievalComponents.vectorStore,
    semanticIndexer: retrievalComponents.semanticIndexer,
    pageLoader,
    pageSyncCoordinator,
    spaceIncrementalSyncCoordinator,
    fullSyncCoordinator,
    internalReindexService,
    incrementalSyncWorker,
  };
}
