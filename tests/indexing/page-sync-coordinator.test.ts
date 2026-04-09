import { describe, expect, it } from "vitest";

import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";
import { PageSyncCoordinator } from "../../src/indexing/page-sync-coordinator.js";
import { InMemorySyncStateStore } from "../../src/indexing/sync-state-store.js";

describe("PageSyncCoordinator", () => {
  it("builds an indexable document, chunks it, and records sync state", async () => {
    const stateStore = new InMemorySyncStateStore();
    const coordinator = new PageSyncCoordinator(stateStore);

    const result = await coordinator.syncPage({
      reason: "manual",
      page: {
        pageId: "123",
        title: "Release Notes",
        status: "current",
        spaceId: "42",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage",
        body: "<p>Overview intro</p><h1>Install</h1><p>Install the service first.</p>",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
      },
      ancestors: [
        {
          pageId: "10",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/overview",
          depth: 1,
        },
      ],
      spaceKey: "ENG",
      lastModified: "2026-04-08T10:00:00Z",
      tenantId: "tenant-a",
      chunking: {
        maxChars: 120,
        overlapChars: 20,
      },
    });

    expect(result.document.pageId).toBe("123");
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.outcome).toBe("indexed");
    expect(result.run.status).toBe("succeeded");
    expect(result.run.stats).toEqual({
      pagesDiscovered: 1,
      pagesIndexed: 1,
      pagesDeleted: 0,
      chunksProduced: result.chunks.length,
    });
    expect(stateStore.getWatermark("page:123")?.lastModified).toBe("2026-04-08T10:00:00Z");
    expect(stateStore.getWatermark("space:ENG")?.lastModified).toBe("2026-04-08T10:00:00Z");
  });

  it("skips reindexing when the loaded page matches the current local snapshot", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const coordinator = new PageSyncCoordinator(stateStore, indexStore);

    const firstRun = await coordinator.syncPage({
      reason: "manual",
      page: {
        pageId: "123",
        title: "Release Notes",
        status: "current",
        spaceId: "42",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage",
        body: "<p>Overview intro</p>",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
      },
      ancestors: [],
      spaceKey: "ENG",
      lastModified: "2026-04-08T10:00:00Z",
      tenantId: "tenant-a",
    });
    const secondRun = await coordinator.syncPage({
      reason: "content_changed",
      page: {
        pageId: "123",
        title: "Release Notes",
        status: "current",
        spaceId: "42",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage",
        body: "<p>Overview intro</p>",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
      },
      ancestors: [],
      spaceKey: "ENG",
      lastModified: "2026-04-08T10:00:00Z",
      tenantId: "tenant-a",
    });

    expect(firstRun.outcome).toBe("indexed");
    expect(secondRun.outcome).toBe("unchanged");
    expect(secondRun.run.stats).toEqual({
      pagesDiscovered: 1,
      pagesIndexed: 0,
      pagesDeleted: 0,
      chunksProduced: 0,
    });
    expect(indexStore.countDocuments()).toBe(1);
    expect(indexStore.countChunks()).toBe(firstRun.chunks.length);
  });
});
