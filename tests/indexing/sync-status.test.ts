import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../../src/config.js";
import { FileDocumentIndexStore } from "../../src/indexing/file-document-index-store.js";
import { FileSyncStateStore } from "../../src/indexing/file-sync-state-store.js";
import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";
import { buildSyncStatusSnapshot } from "../../src/indexing/sync-status.js";
import { InMemorySyncStateStore } from "../../src/indexing/sync-state-store.js";
import { FileVectorStore } from "../../src/retrieval/file-vector-store.js";

function createConfig(): AppConfig {
  return {
    app: {
      env: "test",
      metricsEnabled: true,
    },
    transport: "http",
    server: {
      host: "127.0.0.1",
      port: 3000,
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
    },
    indexing: {
      tenantId: "tenant-a",
      storage: {
        driver: "memory",
        path: ".data/indexing-test",
      },
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
      sync: {
        enabled: true,
        pollIntervalMs: 60_000,
        spaceKeys: ["ENG", "OPS"],
        maxPagesPerSpace: 25,
        runOnStartup: false,
        fullReconcile: {
          enabled: true,
          intervalRuns: 4,
          runOnStartup: false,
        },
      },
      semantic: {
        enabled: false,
        embeddingProvider: "hash",
        embeddingDimensions: 256,
        vectorStoreDriver: "memory",
        vectorStorePath: ".data/indexing-test/vectors.json",
      },
    },
    defaults: {
      topK: 10,
    },
    logLevel: "error",
  };
}

const directories: string[] = [];

function createStorageDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "confluence-mcp-sync-status-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0, directories.length)) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }
});

describe("buildSyncStatusSnapshot", () => {
  it("summarizes worker state, local index state, watermarks, and recent runs", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const queuedRun = stateStore.createSpaceReindexRun("ENG", "content_changed");
    stateStore.markRunRunning(queuedRun.runId);
    stateStore.markRunSucceeded(queuedRun.runId, {
      pagesDiscovered: 2,
      pagesIndexed: 1,
      pagesDeleted: 1,
      chunksProduced: 3,
    });
    stateStore.upsertWatermark("space:ENG", "2026-04-08T10:00:00Z");
    stateStore.upsertWatermark("page:123", "2026-04-08T10:00:00Z");
    indexStore.upsertPageDocument({
      document: {
        contentType: "page",
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: [],
        body: "<p>Hello</p>",
        bodyFormat: "storage",
        lastModified: "2026-04-08T10:00:00Z",
        version: {
          number: 1,
          createdAt: "2026-04-08T10:00:00Z",
        },
        tenantId: "tenant-a",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      },
      chunks: [
        {
          chunkId: "chunk:123:0",
          documentId: "page:123",
          chunkIndex: 0,
          content: "Hello",
          charCount: 5,
          metadata: {
            contentType: "page",
            pageId: "123",
            pageTitle: "Release Notes",
            spaceKey: "ENG",
            ancestorIds: [],
            sectionPath: ["Release Notes"],
            lastModified: "2026-04-08T10:00:00Z",
            version: {
              number: 1,
              createdAt: "2026-04-08T10:00:00Z",
            },
            tenantId: "tenant-a",
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            bodyFormat: "storage",
          },
        },
      ],
    });

    const snapshot = await buildSyncStatusSnapshot({
      config: createConfig(),
      stateStore,
      indexStore,
      worker: {
        isEnabled: () => true,
        getConfiguredSpaceKeys: () => ["ENG", "OPS"],
        getStatusSnapshot: () => ({
          hasActiveRun: false,
          completedRunCount: 3,
          lastRunSummary: {
            trigger: "scheduled",
            startedAt: "2026-04-09T10:00:00Z",
            finishedAt: "2026-04-09T10:00:05Z",
            processedSpaceKeys: ["ENG"],
            failedSpaceKeys: [],
            fullReconciliationPerformed: true,
            fullReconciliationSucceeded: true,
            reconciledSpaceKeys: ["ENG"],
            durationMs: 5000,
          },
        }),
      },
      vectorStore: null,
    });

    expect(snapshot.worker).toEqual({
      enabled: true,
      hasActiveRun: false,
      completedRunCount: 3,
      configuredSpaceKeys: ["ENG", "OPS"],
      pollIntervalMs: 60_000,
      maxPagesPerSpace: 25,
      runOnStartup: false,
      fullReconcile: {
        enabled: true,
        intervalRuns: 4,
        runOnStartup: false,
      },
      lastRunSummary: {
        trigger: "scheduled",
        startedAt: "2026-04-09T10:00:00Z",
        finishedAt: "2026-04-09T10:00:05Z",
        processedSpaceKeys: ["ENG"],
        failedSpaceKeys: [],
        fullReconciliationPerformed: true,
        fullReconciliationSucceeded: true,
        reconciledSpaceKeys: ["ENG"],
        durationMs: 5000,
      },
    });
    expect(snapshot.index).toEqual({
      documentCount: 1,
      chunkCount: 1,
      vectorRecordCount: null,
      spaces: [
        {
          spaceKey: "ENG",
          documentCount: 1,
          chunkCount: 1,
        },
      ],
    });
    expect(snapshot.watermarks.map((watermark) => watermark.scopeKey)).toEqual([
      "page:123",
      "space:ENG",
    ]);
    expect(snapshot.recentRuns).toHaveLength(1);
    expect(snapshot.recentRuns[0]?.stats?.pagesDeleted).toBe(1);
  });

  it("reflects file-backed external writes without restarting the long-lived reader", async () => {
    const directory = createStorageDirectory();
    const longLivedIndexStore = new FileDocumentIndexStore(join(directory, "documents.json"));
    const longLivedStateStore = new FileSyncStateStore(join(directory, "sync-state.json"));
    const longLivedVectorStore = new FileVectorStore(join(directory, "vectors.json"));

    const externalIndexStore = new FileDocumentIndexStore(join(directory, "documents.json"));
    const externalStateStore = new FileSyncStateStore(join(directory, "sync-state.json"));
    const externalVectorStore = new FileVectorStore(join(directory, "vectors.json"));

    externalIndexStore.upsertPageDocument({
      document: {
        contentType: "page",
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: ["10"],
        body: "<p>Hello world</p>",
        bodyFormat: "storage",
        lastModified: "2026-04-09T10:00:00Z",
        version: {
          number: 2,
          createdAt: "2026-04-09T10:00:00Z",
        },
        tenantId: "tenant-a",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      },
      chunks: [
        {
          chunkId: "chunk:123:0",
          documentId: "page:123",
          chunkIndex: 0,
          content: "Hello world",
          charCount: 11,
          metadata: {
            contentType: "page",
            pageId: "123",
            pageTitle: "Release Notes",
            spaceKey: "ENG",
            ancestorIds: ["10"],
            sectionPath: ["Release Notes"],
            lastModified: "2026-04-09T10:00:00Z",
            version: {
              number: 2,
              createdAt: "2026-04-09T10:00:00Z",
            },
            tenantId: "tenant-a",
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            bodyFormat: "storage",
          },
        },
      ],
    });
    externalStateStore.upsertWatermark("space:ENG", "2026-04-09T10:00:00Z");
    externalVectorStore.upsertPageChunks("123", [
      {
        chunkId: "chunk:123:0",
        documentId: "page:123",
        pageId: "123",
        content: "Hello world",
        metadata: {
          contentType: "page",
          pageId: "123",
          pageTitle: "Release Notes",
          spaceKey: "ENG",
          ancestorIds: ["10"],
          sectionPath: ["Release Notes"],
          lastModified: "2026-04-09T10:00:00Z",
          version: {
            number: 2,
            createdAt: "2026-04-09T10:00:00Z",
          },
          tenantId: "tenant-a",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          bodyFormat: "storage",
        },
        embedding: [1, 0, 0],
        updatedAt: "2026-04-09T10:00:00Z",
      },
    ]);

    const snapshot = await buildSyncStatusSnapshot({
      config: createConfig(),
      stateStore: longLivedStateStore,
      indexStore: longLivedIndexStore,
      vectorStore: longLivedVectorStore,
      worker: {
        isEnabled: () => false,
        getConfiguredSpaceKeys: () => [],
        getStatusSnapshot: () => ({
          hasActiveRun: false,
          completedRunCount: 0,
          lastRunSummary: null,
        }),
      },
    });

    expect(snapshot.index.documentCount).toBe(1);
    expect(snapshot.index.chunkCount).toBe(1);
    expect(snapshot.index.vectorRecordCount).toBe(1);
    expect(snapshot.watermarks[0]?.scopeKey).toBe("space:ENG");
  });
});
