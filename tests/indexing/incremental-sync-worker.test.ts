import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config.js";
import { IncrementalSyncWorker } from "../../src/indexing/incremental-sync-worker.js";
import { createLogger } from "../../src/logging/logger.js";
import { MetricsRegistry } from "../../src/observability/metrics-registry.js";

function createTestConfig(): AppConfig {
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
          enabled: false,
          intervalRuns: 12,
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

describe("IncrementalSyncWorker", () => {
  it("runs configured space syncs and records sync metrics", async () => {
    const metrics = new MetricsRegistry();
    const syncSpace = vi
      .fn()
      .mockResolvedValueOnce({
        run: {
          runId: "space-run-1",
          target: { type: "space", spaceKey: "ENG" },
          reason: "content_changed",
          status: "succeeded",
          queuedAt: "2026-04-09T10:00:00Z",
          startedAt: "2026-04-09T10:00:00Z",
          finishedAt: "2026-04-09T10:01:00Z",
          stats: {
            pagesDiscovered: 2,
            pagesIndexed: 2,
            pagesDeleted: 0,
            chunksProduced: 8,
          },
          errorMessage: null,
        },
        pageRuns: [],
        watermark: {
          scopeKey: "space:ENG",
          lastModified: new Date(Date.now() - 30_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        startedFrom: "2026-04-09T09:00:00Z",
      })
      .mockResolvedValueOnce({
        run: {
          runId: "space-run-2",
          target: { type: "space", spaceKey: "OPS" },
          reason: "content_changed",
          status: "succeeded",
          queuedAt: "2026-04-09T10:00:00Z",
          startedAt: "2026-04-09T10:00:00Z",
          finishedAt: "2026-04-09T10:01:00Z",
          stats: {
            pagesDiscovered: 1,
            pagesIndexed: 1,
            pagesDeleted: 0,
            chunksProduced: 3,
          },
          errorMessage: null,
        },
        pageRuns: [],
        watermark: {
          scopeKey: "space:OPS",
          lastModified: new Date(Date.now() - 60_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        startedFrom: "2026-04-09T09:00:00Z",
      });

    const worker = new IncrementalSyncWorker(createTestConfig(), createLogger("error"), metrics, {
      syncSpace,
    });

    const summary = await worker.runOnce();
    const snapshot = metrics.snapshot();

    expect(syncSpace).toHaveBeenNthCalledWith(1, {
      spaceKey: "ENG",
      tenantId: "tenant-a",
      reason: "content_changed",
      maxPages: 25,
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
    });
    expect(syncSpace).toHaveBeenNthCalledWith(2, {
      spaceKey: "OPS",
      tenantId: "tenant-a",
      reason: "content_changed",
      maxPages: 25,
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
    });
    expect(summary.processedSpaceKeys).toEqual(["ENG", "OPS"]);
    expect(summary.failedSpaceKeys).toEqual([]);
    expect(summary.fullReconciliationPerformed).toBe(false);
    expect(summary.fullReconciliationSucceeded).toBeNull();
    expect(summary.reconciledSpaceKeys).toEqual([]);
    expect(snapshot.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sync_runs_total",
          tags: expect.objectContaining({
            outcome: "success",
            spaceKey: "ENG",
          }),
          value: 1,
        }),
        expect.objectContaining({
          name: "sync_runs_total",
          tags: expect.objectContaining({
            outcome: "success",
            spaceKey: "OPS",
          }),
          value: 1,
        }),
      ]),
    );
    expect(snapshot.gauges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sync_lag_seconds",
          tags: expect.objectContaining({
            spaceKey: "ENG",
          }),
        }),
        expect.objectContaining({
          name: "sync_lag_seconds",
          tags: expect.objectContaining({
            spaceKey: "OPS",
          }),
        }),
      ]),
    );
    expect(snapshot.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sync_run_duration_ms",
        }),
      ]),
    );
  });

  it("continues processing other spaces when one sync fails", async () => {
    const metrics = new MetricsRegistry();
    const syncSpace = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        run: {
          runId: "space-run-2",
          target: { type: "space", spaceKey: "OPS" },
          reason: "content_changed",
          status: "succeeded",
          queuedAt: "2026-04-09T10:00:00Z",
          startedAt: "2026-04-09T10:00:00Z",
          finishedAt: "2026-04-09T10:01:00Z",
          stats: {
            pagesDiscovered: 1,
            pagesIndexed: 1,
            pagesDeleted: 0,
            chunksProduced: 3,
          },
          errorMessage: null,
        },
        pageRuns: [],
        watermark: {
          scopeKey: "space:OPS",
          lastModified: new Date(Date.now() - 15_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        startedFrom: "2026-04-09T09:00:00Z",
      });

    const worker = new IncrementalSyncWorker(createTestConfig(), createLogger("error"), metrics, {
      syncSpace,
    });

    const summary = await worker.runOnce("scheduled");

    expect(summary.processedSpaceKeys).toEqual(["OPS"]);
    expect(summary.failedSpaceKeys).toEqual(["ENG"]);
    expect(metrics.snapshot().counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sync_runs_total",
          tags: expect.objectContaining({
            outcome: "error",
            spaceKey: "ENG",
            trigger: "scheduled",
          }),
        }),
      ]),
    );
  });

  it("does not start when sync is disabled or no spaces are configured", () => {
    const baseConfig = createTestConfig();
    const workerDisabled = new IncrementalSyncWorker(
      {
        ...baseConfig,
        indexing: {
          ...baseConfig.indexing!,
          sync: {
            ...baseConfig.indexing!.sync,
            enabled: false,
          },
        },
      },
      createLogger("error"),
      new MetricsRegistry(),
      {
        syncSpace: vi.fn(),
      },
    );
    const workerNoSpaces = new IncrementalSyncWorker(
      {
        ...baseConfig,
        indexing: {
          ...baseConfig.indexing!,
          sync: {
            ...baseConfig.indexing!.sync,
            spaceKeys: [],
          },
        },
      },
      createLogger("error"),
      new MetricsRegistry(),
      {
        syncSpace: vi.fn(),
      },
    );

    expect(workerDisabled.start()).toBe(false);
    expect(workerNoSpaces.start()).toBe(false);
  });

  it("runs periodic full reconciliation and records full-sync metrics", async () => {
    const metrics = new MetricsRegistry();
    const config = {
      ...createTestConfig(),
      indexing: {
        ...createTestConfig().indexing!,
        sync: {
          ...createTestConfig().indexing!.sync,
          fullReconcile: {
            enabled: true,
            intervalRuns: 2,
            runOnStartup: false,
          },
        },
      },
    } satisfies AppConfig;
    const syncSpace = vi.fn(async ({ spaceKey }: { spaceKey: string }) => ({
      run: {
        runId: `space-run-${spaceKey}`,
        target: { type: "space" as const, spaceKey },
        reason: "content_changed" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T10:00:00Z",
        startedAt: "2026-04-09T10:00:00Z",
        finishedAt: "2026-04-09T10:01:00Z",
        stats: {
          pagesDiscovered: 1,
          pagesIndexed: 1,
          pagesDeleted: 0,
          chunksProduced: 1,
        },
        errorMessage: null,
      },
      pageRuns: [],
      watermark: {
        scopeKey: `space:${spaceKey}`,
        lastModified: new Date(Date.now() - 10_000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      startedFrom: "2026-04-09T09:00:00Z",
    }));
    const syncAll = vi.fn(async () => ({
      run: {
        runId: "full-run-1",
        target: { type: "full" as const },
        reason: "bootstrap" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T10:00:00Z",
        startedAt: "2026-04-09T10:00:00Z",
        finishedAt: "2026-04-09T10:01:00Z",
        stats: {
          pagesDiscovered: 2,
          pagesIndexed: 1,
          pagesDeleted: 1,
          chunksProduced: 3,
        },
        errorMessage: null,
      },
      processedSpaceKeys: ["ENG", "OPS"],
      spaceRuns: [],
    }));

    const worker = new IncrementalSyncWorker(
      config,
      createLogger("error"),
      metrics,
      {
        syncSpace,
      },
      {
        syncAll,
      },
    );

    const firstSummary = await worker.runOnce("manual");
    const secondSummary = await worker.runOnce("scheduled");
    const snapshot = metrics.snapshot();

    expect(firstSummary.fullReconciliationPerformed).toBe(false);
    expect(secondSummary.fullReconciliationPerformed).toBe(true);
    expect(secondSummary.fullReconciliationSucceeded).toBe(true);
    expect(secondSummary.reconciledSpaceKeys).toEqual(["ENG", "OPS"]);
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(syncAll).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      spaceKeys: ["ENG", "OPS"],
      maxPagesPerSpace: 25,
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
      reason: "bootstrap",
    });
    expect(snapshot.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sync_runs_total",
          tags: expect.objectContaining({
            scope: "full",
            outcome: "success",
            trigger: "scheduled",
          }),
          value: 1,
        }),
      ]),
    );
  });

  it("runs full reconciliation on startup when configured", async () => {
    const metrics = new MetricsRegistry();
    const config = {
      ...createTestConfig(),
      indexing: {
        ...createTestConfig().indexing!,
        sync: {
          ...createTestConfig().indexing!.sync,
          fullReconcile: {
            enabled: true,
            intervalRuns: 10,
            runOnStartup: true,
          },
        },
      },
    } satisfies AppConfig;
    const syncAll = vi.fn(async () => ({
      run: {
        runId: "full-run-1",
        target: { type: "full" as const },
        reason: "bootstrap" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T10:00:00Z",
        startedAt: "2026-04-09T10:00:00Z",
        finishedAt: "2026-04-09T10:01:00Z",
        stats: {
          pagesDiscovered: 0,
          pagesIndexed: 0,
          pagesDeleted: 0,
          chunksProduced: 0,
        },
        errorMessage: null,
      },
      processedSpaceKeys: ["ENG", "OPS"],
      spaceRuns: [],
    }));

    const worker = new IncrementalSyncWorker(
      config,
      createLogger("error"),
      metrics,
      {
        syncSpace: vi.fn(async ({ spaceKey }: { spaceKey: string }) => ({
          run: {
            runId: `space-run-${spaceKey}`,
            target: { type: "space" as const, spaceKey },
            reason: "content_changed" as const,
            status: "succeeded" as const,
            queuedAt: "2026-04-09T10:00:00Z",
            startedAt: "2026-04-09T10:00:00Z",
            finishedAt: "2026-04-09T10:01:00Z",
            stats: {
              pagesDiscovered: 0,
              pagesIndexed: 0,
              pagesDeleted: 0,
              chunksProduced: 0,
            },
            errorMessage: null,
          },
          pageRuns: [],
          watermark: null,
          startedFrom: "2026-04-09T09:00:00Z",
        })),
      },
      {
        syncAll,
      },
    );

    const summary = await worker.runOnce("startup");

    expect(summary.fullReconciliationPerformed).toBe(true);
    expect(summary.fullReconciliationSucceeded).toBe(true);
    expect(syncAll).toHaveBeenCalledTimes(1);
  });
});
