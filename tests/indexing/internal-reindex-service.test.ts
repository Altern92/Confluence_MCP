import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config.js";
import { InternalReindexService } from "../../src/indexing/internal-reindex-service.js";

function createTestConfig(allowedSpaceKeys: string[] = []): Pick<AppConfig, "indexing" | "policy"> {
  return {
    policy: {
      allowedSpaceKeys,
      allowedRootPageIds: [],
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
        pollIntervalMs: 300_000,
        spaceKeys: ["ENG", "OPS"],
        maxPagesPerSpace: 500,
        runOnStartup: true,
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
  };
}

describe("InternalReindexService", () => {
  it("reindexes a single page using configured tenant and chunking defaults", async () => {
    const loadedPage = {
      page: {
        pageId: "123",
        title: "Release Notes",
        status: "current" as const,
        spaceId: "42",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage" as const,
        body: "<p>Body</p>",
        version: {
          number: 3,
          createdAt: "2026-04-09T08:00:00Z",
        },
      },
      ancestors: [],
      spaceKey: "ENG",
      lastModified: "2026-04-09T08:00:00Z",
      tenantId: "tenant-a",
    };
    const loadPageForSync = vi.fn(async () => loadedPage);
    const syncPage = vi.fn(async () => ({
      run: {
        runId: "run-1",
        target: {
          type: "page" as const,
          pageId: "123",
        },
        reason: "manual" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T08:00:00Z",
        startedAt: "2026-04-09T08:00:01Z",
        finishedAt: "2026-04-09T08:00:02Z",
        stats: {
          pagesDiscovered: 1,
          pagesIndexed: 1,
          pagesDeleted: 0,
          chunksProduced: 1,
        },
        errorMessage: null,
      },
      document: {
        contentType: "page" as const,
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: [],
        body: "Body",
        bodyFormat: "storage" as const,
        lastModified: "2026-04-09T08:00:00Z",
        version: {
          number: 3,
          createdAt: "2026-04-09T08:00:00Z",
        },
        tenantId: "tenant-a",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      },
      chunks: [],
      outcome: "indexed" as const,
    }));

    const service = new InternalReindexService(
      createTestConfig(),
      {
        loadPageForSync,
      },
      {
        syncPage,
      },
      {
        syncAll: vi.fn(),
      },
    );

    const result = await service.reindexPage({
      pageId: "123",
      spaceKey: "ENG",
    });

    expect(loadPageForSync).toHaveBeenCalledWith({
      pageId: "123",
      spaceKey: "ENG",
      tenantId: "tenant-a",
      bodyFormat: undefined,
    });
    expect(syncPage).toHaveBeenCalledWith({
      ...loadedPage,
      reason: "manual",
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
    });
    expect(result.outcome).toBe("indexed");
  });

  it("reindexes a single space through the full sync coordinator", async () => {
    const syncAll = vi.fn(async () => ({
      run: {
        runId: "full-1",
        target: {
          type: "full" as const,
        },
        reason: "manual" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T08:00:00Z",
        startedAt: "2026-04-09T08:00:01Z",
        finishedAt: "2026-04-09T08:00:03Z",
        stats: {
          pagesDiscovered: 2,
          pagesIndexed: 2,
          pagesDeleted: 1,
          chunksProduced: 5,
        },
        errorMessage: null,
      },
      spaceRuns: [],
      processedSpaceKeys: ["ENG"],
    }));
    const service = new InternalReindexService(
      createTestConfig(),
      {
        loadPageForSync: vi.fn(),
      },
      {
        syncPage: vi.fn(),
      },
      {
        syncAll,
      },
    );

    const result = await service.reindexSpace({
      spaceKey: "ENG",
    });

    expect(syncAll).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      spaceKeys: ["ENG"],
      maxPagesPerSpace: 500,
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
      reason: "manual",
    });
    expect(result.processedSpaceKeys).toEqual(["ENG"]);
  });

  it("runs a full internal reindex with caller overrides", async () => {
    const syncAll = vi.fn(async () => ({
      run: {
        runId: "full-2",
        target: {
          type: "full" as const,
        },
        reason: "bootstrap" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T08:00:00Z",
        startedAt: "2026-04-09T08:00:01Z",
        finishedAt: "2026-04-09T08:00:03Z",
        stats: {
          pagesDiscovered: 4,
          pagesIndexed: 4,
          pagesDeleted: 0,
          chunksProduced: 10,
        },
        errorMessage: null,
      },
      spaceRuns: [],
      processedSpaceKeys: ["ENG", "OPS"],
    }));
    const service = new InternalReindexService(
      createTestConfig(),
      {
        loadPageForSync: vi.fn(),
      },
      {
        syncPage: vi.fn(),
      },
      {
        syncAll,
      },
    );

    await service.fullReindex({
      tenantId: "tenant-b",
      spaceKeys: ["ENG", "OPS"],
      maxSpaces: 2,
      maxPagesPerSpace: 250,
      chunking: {
        maxChars: 900,
        overlapChars: 90,
      },
      reason: "bootstrap",
    });

    expect(syncAll).toHaveBeenCalledWith({
      tenantId: "tenant-b",
      spaceKeys: ["ENG", "OPS"],
      maxSpaces: 2,
      maxPagesPerSpace: 250,
      chunking: {
        maxChars: 900,
        overlapChars: 90,
      },
      reason: "bootstrap",
    });
  });

  it("rejects reindexing a space outside the configured space allowlist", async () => {
    const service = new InternalReindexService(
      createTestConfig(["OPS"]),
      {
        loadPageForSync: vi.fn(),
      },
      {
        syncPage: vi.fn(),
      },
      {
        syncAll: vi.fn(),
      },
    );

    await expect(
      service.reindexSpace({
        spaceKey: "ENG",
      }),
    ).rejects.toThrow('Space reindex is not allowed for space "ENG"');
  });

  it("limits full reindex to the configured space allowlist when no explicit spaces are requested", async () => {
    const syncAll = vi.fn(async () => ({
      run: {
        runId: "full-3",
        target: {
          type: "full" as const,
        },
        reason: "manual" as const,
        status: "succeeded" as const,
        queuedAt: "2026-04-09T08:00:00Z",
        startedAt: "2026-04-09T08:00:01Z",
        finishedAt: "2026-04-09T08:00:03Z",
        stats: {
          pagesDiscovered: 1,
          pagesIndexed: 1,
          pagesDeleted: 0,
          chunksProduced: 1,
        },
        errorMessage: null,
      },
      spaceRuns: [],
      processedSpaceKeys: ["OPS"],
    }));
    const service = new InternalReindexService(
      createTestConfig(["OPS"]),
      {
        loadPageForSync: vi.fn(),
      },
      {
        syncPage: vi.fn(),
      },
      {
        syncAll,
      },
    );

    await service.fullReindex();

    expect(syncAll).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      spaceKeys: ["OPS"],
      maxSpaces: undefined,
      maxPagesPerSpace: 500,
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
      reason: "manual",
    });
  });
});
