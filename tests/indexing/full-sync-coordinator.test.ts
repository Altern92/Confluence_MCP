import { describe, expect, it, vi } from "vitest";

import {
  FullSyncCoordinator,
  mapEligibleSpaceKeys,
} from "../../src/indexing/full-sync-coordinator.js";
import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";
import { PageSyncCoordinator } from "../../src/indexing/page-sync-coordinator.js";
import { InMemorySyncStateStore } from "../../src/indexing/sync-state-store.js";
import type { IndexedDocumentChunk, IndexableConfluencePage } from "../../src/indexing/types.js";

function createPolicyConfig(allowedSpaceKeys: string[] = []) {
  return {
    policy: {
      allowedSpaceKeys,
      allowedRootPageIds: [],
    },
  };
}

function createLoadedPage(pageId: string, spaceKey: string, title = `Page ${pageId}`) {
  const createdAt = "2026-04-08T10:00:00Z";

  return {
    page: {
      pageId,
      title,
      status: "current" as const,
      spaceId: "42",
      url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
      bodyFormat: "storage" as const,
      body: `<p>${title} body</p>`,
      version: {
        number: 1,
        createdAt,
      },
    },
    ancestors: [],
    spaceKey,
    lastModified: createdAt,
    tenantId: "tenant-a",
  };
}

function createIndexedDocument(pageId: string, spaceKey: string): IndexableConfluencePage {
  return {
    contentType: "page",
    pageId,
    title: `Page ${pageId}`,
    spaceKey,
    ancestorIds: [],
    body: `Body ${pageId}`,
    bodyFormat: "storage",
    lastModified: "2026-04-08T10:00:00Z",
    version: {
      number: 1,
      createdAt: "2026-04-08T10:00:00Z",
    },
    tenantId: "tenant-a",
    url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
  };
}

function createChunk(pageId: string, spaceKey: string): IndexedDocumentChunk {
  return {
    chunkId: `chunk:${pageId}:0`,
    documentId: `page:${pageId}`,
    chunkIndex: 0,
    content: `Body ${pageId}`,
    charCount: `Body ${pageId}`.length,
    metadata: {
      contentType: "page",
      pageId,
      pageTitle: `Page ${pageId}`,
      spaceKey,
      ancestorIds: [],
      sectionPath: [`Page ${pageId}`],
      lastModified: "2026-04-08T10:00:00Z",
      version: {
        number: 1,
        createdAt: "2026-04-08T10:00:00Z",
      },
      tenantId: "tenant-a",
      url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
      bodyFormat: "storage",
    },
  };
}

describe("FullSyncCoordinator", () => {
  it("bootstraps full sync across paged spaces and aggregates run stats", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const pageSyncCoordinator = new PageSyncCoordinator(stateStore, indexStore);
    const getSpaces = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ id: "1", key: "ENG", name: "Engineering" }],
        _links: {
          next: "/wiki/api/v2/spaces?cursor=spaces-2",
        },
      })
      .mockResolvedValueOnce({
        results: [{ id: "2", key: "OPS", name: "Operations" }],
        _links: {},
      });
    const getSpacePages = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ id: "101", title: "ENG 101" }],
        _links: {
          next: "/wiki/api/v2/spaces/1/pages?cursor=eng-2",
        },
      })
      .mockResolvedValueOnce({
        results: [{ id: "102", title: "ENG 102" }],
        _links: {},
      })
      .mockResolvedValueOnce({
        results: [{ id: "201", title: "OPS 201" }],
        _links: {},
      });
    const loadPageForSync = vi
      .fn()
      .mockResolvedValueOnce(createLoadedPage("101", "ENG", "ENG 101"))
      .mockResolvedValueOnce(createLoadedPage("102", "ENG", "ENG 102"))
      .mockResolvedValueOnce(createLoadedPage("201", "OPS", "OPS 201"));

    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(),
      {
        getSpaces,
        getSpacePages,
      },
      {
        loadPageForSync,
      },
      pageSyncCoordinator,
      stateStore,
      indexStore,
    );

    const result = await coordinator.syncAll({
      tenantId: "tenant-a",
      maxPagesPerSpace: 25,
    });

    expect(getSpaces).toHaveBeenNthCalledWith(1, {
      limit: 50,
      cursor: undefined,
    });
    expect(getSpaces).toHaveBeenNthCalledWith(2, {
      limit: 50,
      cursor: "spaces-2",
    });
    expect(getSpacePages).toHaveBeenNthCalledWith(1, "1", {
      limit: 25,
      cursor: undefined,
    });
    expect(getSpacePages).toHaveBeenNthCalledWith(2, "1", {
      limit: 24,
      cursor: "eng-2",
    });
    expect(getSpacePages).toHaveBeenNthCalledWith(3, "2", {
      limit: 25,
      cursor: undefined,
    });
    expect(loadPageForSync).toHaveBeenCalledTimes(3);
    expect(result.processedSpaceKeys).toEqual(["ENG", "OPS"]);
    expect(result.run.status).toBe("succeeded");
    expect(result.run.stats).toEqual({
      pagesDiscovered: 3,
      pagesIndexed: 3,
      pagesDeleted: 0,
      chunksProduced: 3,
    });
    expect(result.spaceRuns).toHaveLength(2);
    expect(indexStore.countDocuments()).toBe(3);
    expect(indexStore.countChunks()).toBe(3);
  });

  it("filters spaces by allowlist and respects maxSpaces", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const pageSyncCoordinator = new PageSyncCoordinator(stateStore, indexStore);
    const getSpacePages = vi.fn(async () => ({
      results: [{ id: "201", title: "OPS 201" }],
      _links: {},
    }));
    const loadPageForSync = vi.fn(async () => createLoadedPage("201", "OPS", "OPS 201"));
    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(),
      {
        getSpaces: vi.fn(async () => ({
          results: [
            { id: "1", key: "ENG", name: "Engineering" },
            { id: "2", key: "OPS", name: "Operations" },
            { id: "3", key: "HR", name: "People" },
          ],
          _links: {},
        })),
        getSpacePages,
      },
      {
        loadPageForSync,
      },
      pageSyncCoordinator,
      stateStore,
      indexStore,
    );

    const result = await coordinator.syncAll({
      spaceKeys: ["OPS", "HR"],
      maxSpaces: 1,
    });

    expect(result.processedSpaceKeys).toEqual(["OPS"]);
    expect(getSpacePages).toHaveBeenCalledTimes(1);
    expect(getSpacePages).toHaveBeenCalledWith("2", {
      limit: 100,
      cursor: undefined,
    });
    expect(loadPageForSync).toHaveBeenCalledTimes(1);
  });

  it("reconciles stale documents when a full space snapshot completes", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const pageSyncCoordinator = new PageSyncCoordinator(stateStore, indexStore);

    indexStore.upsertPageDocument({
      document: createIndexedDocument("stale-eng", "ENG"),
      chunks: [createChunk("stale-eng", "ENG")],
    });
    indexStore.upsertPageDocument({
      document: createIndexedDocument("keep-ops", "OPS"),
      chunks: [createChunk("keep-ops", "OPS")],
    });

    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(),
      {
        getSpaces: vi.fn(async () => ({
          results: [{ id: "1", key: "ENG", name: "Engineering" }],
          _links: {},
        })),
        getSpacePages: vi.fn(async () => ({
          results: [{ id: "123", title: "Current ENG page" }],
          _links: {},
        })),
      },
      {
        loadPageForSync: vi.fn(async () => createLoadedPage("123", "ENG", "Current ENG page")),
      },
      pageSyncCoordinator,
      stateStore,
      indexStore,
    );

    const result = await coordinator.syncAll();

    expect(result.run.stats?.pagesDeleted).toBe(1);
    expect(result.spaceRuns[0]?.stats?.pagesDeleted).toBe(1);
    expect(indexStore.listPageDocumentsBySpace("ENG").map((record) => record.pageId)).toEqual([
      "123",
    ]);
    expect(indexStore.listPageDocumentsBySpace("OPS").map((record) => record.pageId)).toEqual([
      "keep-ops",
    ]);
  });

  it("does not delete stale documents when a space snapshot is truncated", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const pageSyncCoordinator = new PageSyncCoordinator(stateStore, indexStore);

    indexStore.upsertPageDocument({
      document: createIndexedDocument("stale-eng", "ENG"),
      chunks: [createChunk("stale-eng", "ENG")],
    });

    const getSpacePages = vi.fn(async () => ({
      results: [{ id: "123", title: "Current ENG page" }],
      _links: {
        next: "/wiki/api/v2/spaces/1/pages?cursor=eng-2",
      },
    }));
    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(),
      {
        getSpaces: vi.fn(async () => ({
          results: [{ id: "1", key: "ENG", name: "Engineering" }],
          _links: {},
        })),
        getSpacePages,
      },
      {
        loadPageForSync: vi.fn(async () => createLoadedPage("123", "ENG", "Current ENG page")),
      },
      pageSyncCoordinator,
      stateStore,
      indexStore,
    );

    const result = await coordinator.syncAll({
      maxPagesPerSpace: 1,
    });

    expect(getSpacePages).toHaveBeenCalledWith("1", {
      limit: 1,
      cursor: undefined,
    });
    expect(result.run.stats?.pagesDeleted).toBe(0);
    expect(result.spaceRuns[0]?.stats?.pagesDeleted).toBe(0);
    expect(indexStore.listPageDocumentsBySpace("ENG").map((record) => record.pageId)).toEqual([
      "123",
      "stale-eng",
    ]);
  });

  it("marks the full run as failed when page sync throws", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(),
      {
        getSpaces: vi.fn(async () => ({
          results: [{ id: "1", key: "ENG", name: "Engineering" }],
          _links: {},
        })),
        getSpacePages: vi.fn(async () => ({
          results: [{ id: "123", title: "Release Notes" }],
          _links: {},
        })),
      },
      {
        loadPageForSync: vi.fn(async () => createLoadedPage("123", "ENG", "Release Notes")),
      },
      {
        syncPage: vi.fn(async () => {
          throw new Error("page sync failed");
        }),
      },
      stateStore,
      indexStore,
    );

    await expect(coordinator.syncAll()).rejects.toThrow("page sync failed");

    const fullRun = stateStore.listRuns().find((candidate) => candidate.target.type === "full");
    const spaceRun = stateStore.listRuns().find((candidate) => candidate.target.type === "space");

    expect(fullRun?.status).toBe("failed");
    expect(fullRun?.errorMessage).toBe("page sync failed");
    expect(spaceRun?.status).toBe("failed");
    expect(spaceRun?.errorMessage).toBe("page sync failed");
  });

  it("uses configured space allowlist when no explicit spaces are requested", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const pageSyncCoordinator = new PageSyncCoordinator(stateStore, indexStore);
    const getSpacePages = vi.fn(async () => ({
      results: [{ id: "201", title: "OPS 201" }],
      _links: {},
    }));
    const loadPageForSync = vi.fn(async () => createLoadedPage("201", "OPS", "OPS 201"));
    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(["OPS"]),
      {
        getSpaces: vi.fn(async () => ({
          results: [
            { id: "1", key: "ENG", name: "Engineering" },
            { id: "2", key: "OPS", name: "Operations" },
          ],
          _links: {},
        })),
        getSpacePages,
      },
      {
        loadPageForSync,
      },
      pageSyncCoordinator,
      stateStore,
      indexStore,
    );

    const result = await coordinator.syncAll();

    expect(result.processedSpaceKeys).toEqual(["OPS"]);
    expect(getSpacePages).toHaveBeenCalledTimes(1);
    expect(getSpacePages).toHaveBeenCalledWith("2", {
      limit: 100,
      cursor: undefined,
    });
  });

  it("rejects explicit full sync spaces outside the configured allowlist", async () => {
    const stateStore = new InMemorySyncStateStore();
    const indexStore = new InMemoryDocumentIndexStore();
    const pageSyncCoordinator = new PageSyncCoordinator(stateStore, indexStore);
    const coordinator = new FullSyncCoordinator(
      createPolicyConfig(["OPS"]),
      {
        getSpaces: vi.fn(),
        getSpacePages: vi.fn(),
      },
      {
        loadPageForSync: vi.fn(),
      },
      pageSyncCoordinator,
      stateStore,
      indexStore,
    );

    await expect(
      coordinator.syncAll({
        spaceKeys: ["ENG"],
      }),
    ).rejects.toThrow('Requested sync is not allowed for space "ENG"');
  });
});

describe("mapEligibleSpaceKeys", () => {
  it("filters out spaces without a key and respects allowlists", () => {
    expect(
      mapEligibleSpaceKeys(
        [
          { id: "1", key: "ENG", name: "Engineering" },
          { id: "2", key: "OPS", name: "Operations" },
          { id: "3", name: "Missing key" },
        ],
        ["OPS"],
      ),
    ).toEqual(["OPS"]);
  });
});
