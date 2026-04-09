import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";

import type { AppContext } from "../../src/app/context.js";
import type { AppConfig } from "../../src/config.js";
import { ConfluenceClient } from "../../src/confluence/client.js";
import type { ConfluenceContentServicePort } from "../../src/domain/confluence-content-service.js";
import { createHttpApp } from "../../src/http/create-app.js";
import { ConfluencePageLoader } from "../../src/indexing/confluence-page-loader.js";
import { FullSyncCoordinator } from "../../src/indexing/full-sync-coordinator.js";
import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";
import { IncrementalSyncWorker } from "../../src/indexing/incremental-sync-worker.js";
import { InternalReindexService } from "../../src/indexing/internal-reindex-service.js";
import { PageSyncCoordinator } from "../../src/indexing/page-sync-coordinator.js";
import { SpaceIncrementalSyncCoordinator } from "../../src/indexing/space-incremental-sync-coordinator.js";
import { InMemorySyncStateStore } from "../../src/indexing/sync-state-store.js";
import { createLogger } from "../../src/logging/logger.js";
import { MetricsRegistry } from "../../src/observability/metrics-registry.js";

export function createTestConfig(): AppConfig {
  return {
    app: {
      env: "test",
      metricsEnabled: true,
    },
    transport: "http",
    server: {
      host: "127.0.0.1",
      port: 0,
      allowedHosts: [],
      allowedHostsSource: "configured",
      allowedOrigins: [],
      apiKey: null,
      nextApiKey: null,
      maxRequestBodyBytes: 256 * 1024,
      requestTimeoutMs: 30_000,
    },
    confluence: {
      baseUrl: "https://example.atlassian.net",
      wikiBaseUrl: "https://example.atlassian.net/wiki",
      email: "user@example.com",
      apiToken: "token",
      runtimeAuth: {
        mode: "service_account",
        allowBaseUrlOverride: false,
      },
    },
    defaults: {
      topK: 10,
    },
    logLevel: "error",
  };
}

export function createTestContext(
  overrides: Partial<Pick<AppContext, "contentService" | "logger" | "config">> = {},
): AppContext {
  const config = overrides.config ?? createTestConfig();
  const logger = overrides.logger ?? createLogger("error");
  const metrics = new MetricsRegistry();
  const contentService =
    overrides.contentService ??
    ({
      search: async () => ({
        retrievalModeUsed: "keyword",
        policyApplied: {
          policyId: "default-secure-rag",
          verificationRequired: true,
          verificationMode: "service_v2_fetch",
          maxTopK: 20,
          maxSnippetChars: 600,
          maxVerifications: 12,
          citationFirst: true,
        },
        results: [],
        nextCursor: null,
        debug: null,
      }),
      getPage: async () => ({
        pageId: "1",
        title: "Placeholder",
        status: null,
        spaceId: null,
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=1",
        bodyFormat: "storage",
        body: "",
        version: { number: null, createdAt: null },
      }),
      getPageTree: async () => ({
        rootPageId: "1",
        descendants: [],
        nextCursor: null,
      }),
      getPageAncestors: async () => ({
        pageId: "1",
        ancestors: [],
        nextCursor: null,
      }),
      getPageRestrictions: async () => ({
        pageId: "1",
        operations: [],
      }),
      getPageDescendants: async () => ({
        pageId: "1",
        descendants: [],
        nextCursor: null,
      }),
      getPageAttachments: async () => ({
        pageId: "1",
        attachments: [],
        nextCursor: null,
      }),
    } satisfies ConfluenceContentServicePort);
  const confluenceClient = new ConfluenceClient({
    config,
    logger,
    metrics,
  });
  const syncStateStore = new InMemorySyncStateStore();
  const indexStore = new InMemoryDocumentIndexStore();
  const pageLoader = new ConfluencePageLoader(contentService);
  const pageSyncCoordinator = new PageSyncCoordinator(syncStateStore, indexStore);
  const spaceIncrementalSyncCoordinator = new SpaceIncrementalSyncCoordinator(
    {
      search: async () => ({
        results: [],
        _links: {},
      }),
    },
    pageLoader,
    pageSyncCoordinator,
    syncStateStore,
  );
  const fullSyncCoordinator = new FullSyncCoordinator(
    {
      getSpaces: async () => ({
        results: [],
        _links: {},
      }),
      getSpacePages: async () => ({
        results: [],
        _links: {},
      }),
    },
    pageLoader,
    pageSyncCoordinator,
    syncStateStore,
    indexStore,
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
  );

  return {
    config,
    logger,
    metrics,
    confluenceClient,
    contentService,
    indexingStoreDriver: "memory",
    indexingStoragePath: null,
    syncStateStore,
    indexStore,
    semanticRetrievalEnabled: false,
    embeddingService: null,
    vectorStore: null,
    semanticIndexer: null,
    pageLoader,
    pageSyncCoordinator,
    spaceIncrementalSyncCoordinator,
    fullSyncCoordinator,
    internalReindexService,
    incrementalSyncWorker,
  };
}

export async function startTestServer(context: AppContext) {
  const app = createHttpApp(context);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  return server;
}

export function getServerBaseUrl(server: HttpServer): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

export async function closeServer(server: HttpServer) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
