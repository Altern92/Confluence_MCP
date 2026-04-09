import { describe, expect, it, vi } from "vitest";

import { SpaceIncrementalSyncCoordinator } from "../../src/indexing/space-incremental-sync-coordinator.js";
import { InMemorySyncStateStore } from "../../src/indexing/sync-state-store.js";

describe("SpaceIncrementalSyncCoordinator", () => {
  it("polls changed pages, syncs them, and updates the space watermark", async () => {
    const stateStore = new InMemorySyncStateStore();
    stateStore.upsertWatermark("space:ENG", "2026-04-08T08:00:00Z");

    const search = vi
      .fn()
      .mockResolvedValueOnce({
        results: [
          {
            content: {
              id: "123",
              space: {
                key: "ENG",
              },
            },
          },
          {
            content: {
              id: "124",
              space: {
                key: "ENG",
              },
            },
          },
        ],
        _links: {
          next: "/wiki/rest/api/search?cursor=cursor-2",
        },
      })
      .mockResolvedValueOnce({
        results: [
          {
            content: {
              id: "124",
              space: {
                key: "ENG",
              },
            },
          },
        ],
        _links: {},
      });
    const loadPageForSync = vi
      .fn()
      .mockResolvedValueOnce({
        page: {
          pageId: "123",
          title: "Release Notes",
          status: "current",
          spaceId: "42",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          bodyFormat: "storage",
          body: "<p>Hello</p>",
          version: {
            number: 3,
            createdAt: "2026-04-08T09:00:00Z",
          },
        },
        ancestors: [],
        spaceKey: "ENG",
        lastModified: "2026-04-08T09:00:00Z",
        tenantId: "tenant-a",
      })
      .mockResolvedValueOnce({
        page: {
          pageId: "124",
          title: "Release Notes 2",
          status: "current",
          spaceId: "42",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124",
          bodyFormat: "storage",
          body: "<p>Hello again</p>",
          version: {
            number: 4,
            createdAt: "2026-04-08T10:00:00Z",
          },
        },
        ancestors: [],
        spaceKey: "ENG",
        lastModified: "2026-04-08T10:00:00Z",
        tenantId: "tenant-a",
      });
    const syncPage = vi
      .fn()
      .mockImplementationOnce((input) => ({
        run: stateStore.createPageReindexRun(input.page.pageId, "content_changed"),
        document: {
          contentType: "page",
          pageId: input.page.pageId,
          title: input.page.title,
          spaceKey: input.spaceKey,
          ancestorIds: [],
          body: input.page.body,
          bodyFormat: input.page.bodyFormat,
          lastModified: input.lastModified,
          version: input.page.version,
          tenantId: input.tenantId,
          url: input.page.url,
        },
        chunks: [
          {
            chunkId: "chunk-1",
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
              lastModified: "2026-04-08T09:00:00Z",
              version: {
                number: 3,
                createdAt: "2026-04-08T09:00:00Z",
              },
              tenantId: "tenant-a",
              url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
              bodyFormat: "storage",
            },
          },
        ],
      }))
      .mockImplementationOnce((input) => ({
        run: stateStore.createPageReindexRun(input.page.pageId, "content_changed"),
        document: {
          contentType: "page",
          pageId: input.page.pageId,
          title: input.page.title,
          spaceKey: input.spaceKey,
          ancestorIds: [],
          body: input.page.body,
          bodyFormat: input.page.bodyFormat,
          lastModified: input.lastModified,
          version: input.page.version,
          tenantId: input.tenantId,
          url: input.page.url,
        },
        chunks: [
          {
            chunkId: "chunk-2",
            documentId: "page:124",
            chunkIndex: 0,
            content: "Hello again",
            charCount: 11,
            metadata: {
              contentType: "page",
              pageId: "124",
              pageTitle: "Release Notes 2",
              spaceKey: "ENG",
              ancestorIds: [],
              sectionPath: ["Release Notes 2"],
              lastModified: "2026-04-08T10:00:00Z",
              version: {
                number: 4,
                createdAt: "2026-04-08T10:00:00Z",
              },
              tenantId: "tenant-a",
              url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124",
              bodyFormat: "storage",
            },
          },
        ],
      }));
    const coordinator = new SpaceIncrementalSyncCoordinator(
      {
        search,
      },
      {
        loadPageForSync,
      },
      {
        syncPage,
      },
      stateStore,
    );

    const result = await coordinator.syncSpace({
      spaceKey: "ENG",
      tenantId: "tenant-a",
    });

    expect(search).toHaveBeenNthCalledWith(
      1,
      'type = page AND space = "ENG" AND lastmodified > "2026-04-08T08:00:00Z"',
      50,
      undefined,
    );
    expect(search).toHaveBeenNthCalledWith(
      2,
      'type = page AND space = "ENG" AND lastmodified > "2026-04-08T08:00:00Z"',
      50,
      "cursor-2",
    );
    expect(loadPageForSync).toHaveBeenCalledTimes(2);
    expect(syncPage).toHaveBeenCalledTimes(2);
    expect(result.run.status).toBe("succeeded");
    expect(result.run.stats).toEqual({
      pagesDiscovered: 2,
      pagesIndexed: 2,
      pagesDeleted: 0,
      chunksProduced: 2,
    });
    expect(result.pageRuns).toHaveLength(2);
    expect(result.startedFrom).toBe("2026-04-08T08:00:00Z");
    expect(result.watermark?.lastModified).toBe("2026-04-08T10:00:00Z");
  });

  it("marks the space run as failed when a page sync throws", async () => {
    const stateStore = new InMemorySyncStateStore();
    const coordinator = new SpaceIncrementalSyncCoordinator(
      {
        search: vi.fn(async () => ({
          results: [
            {
              content: {
                id: "123",
                space: {
                  key: "ENG",
                },
              },
            },
          ],
          _links: {},
        })),
      },
      {
        loadPageForSync: vi.fn(async () => ({
          page: {
            pageId: "123",
            title: "Release Notes",
            status: "current",
            spaceId: "42",
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            bodyFormat: "storage",
            body: "<p>Hello</p>",
            version: {
              number: 3,
              createdAt: "2026-04-08T09:00:00Z",
            },
          },
          ancestors: [],
          spaceKey: "ENG",
          lastModified: "2026-04-08T09:00:00Z",
          tenantId: null,
        })),
      },
      {
        syncPage: vi.fn(async () => {
          throw new Error("sync failed");
        }),
      },
      stateStore,
    );

    await expect(
      coordinator.syncSpace({
        spaceKey: "ENG",
      }),
    ).rejects.toThrow("sync failed");

    const run = stateStore.listRuns().find((candidate) => candidate.target.type === "space");
    expect(run?.status).toBe("failed");
    expect(run?.errorMessage).toBe("sync failed");
  });

  it("uses page sync stats for reconciliation so unchanged pages are not counted as indexed", async () => {
    const stateStore = new InMemorySyncStateStore();
    const coordinator = new SpaceIncrementalSyncCoordinator(
      {
        search: vi.fn(async () => ({
          results: [
            {
              content: {
                id: "123",
                space: {
                  key: "ENG",
                },
              },
            },
          ],
          _links: {},
        })),
      },
      {
        loadPageForSync: vi.fn(async () => ({
          page: {
            pageId: "123",
            title: "Release Notes",
            status: "current",
            spaceId: "42",
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            bodyFormat: "storage",
            body: "<p>Hello</p>",
            version: {
              number: 3,
              createdAt: "2026-04-08T09:00:00Z",
            },
          },
          ancestors: [],
          spaceKey: "ENG",
          lastModified: "2026-04-08T09:00:00Z",
          tenantId: null,
        })),
      },
      {
        syncPage: vi.fn(async (input) => ({
          run: {
            runId: `page-run-${input.page.pageId}`,
            target: {
              type: "page",
              pageId: input.page.pageId,
            },
            reason: "content_changed",
            status: "succeeded",
            queuedAt: "2026-04-08T09:00:00Z",
            startedAt: "2026-04-08T09:00:00Z",
            finishedAt: "2026-04-08T09:00:01Z",
            stats: {
              pagesDiscovered: 1,
              pagesIndexed: 0,
              pagesDeleted: 0,
              chunksProduced: 0,
            },
            errorMessage: null,
          },
          document: {
            contentType: "page",
            pageId: input.page.pageId,
            title: input.page.title,
            spaceKey: input.spaceKey,
            ancestorIds: [],
            body: input.page.body,
            bodyFormat: input.page.bodyFormat,
            lastModified: input.lastModified,
            version: input.page.version,
            tenantId: input.tenantId,
            url: input.page.url,
          },
          chunks: [],
          outcome: "unchanged" as const,
        })),
      },
      stateStore,
    );

    const result = await coordinator.syncSpace({
      spaceKey: "ENG",
    });

    expect(result.run.stats).toEqual({
      pagesDiscovered: 1,
      pagesIndexed: 0,
      pagesDeleted: 0,
      chunksProduced: 0,
    });
  });
});
