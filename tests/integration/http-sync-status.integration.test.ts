import type { Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { closeServer, createTestContext, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: http sync-status endpoint", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (!server) {
        continue;
      }

      await closeServer(server);
    }
  });

  it("returns sync diagnostics when authorized", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          apiKey: "top-secret",
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
            spaceKeys: ["ENG"],
            maxPagesPerSpace: 25,
            runOnStartup: false,
            fullReconcile: {
              enabled: true,
              intervalRuns: 3,
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
      },
    });

    context.syncStateStore.upsertWatermark("space:ENG", "2026-04-08T10:00:00Z");
    const run = context.syncStateStore.createSpaceReindexRun("ENG", "content_changed");
    context.syncStateStore.markRunRunning(run.runId);
    context.syncStateStore.markRunSucceeded(run.runId, {
      pagesDiscovered: 1,
      pagesIndexed: 1,
      pagesDeleted: 0,
      chunksProduced: 1,
    });
    context.indexStore.upsertPageDocument({
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

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/sync-status`, {
      headers: {
        "x-api-key": "top-secret",
      },
    });
    const body = (await response.json()) as {
      environment: string;
      syncStatus: {
        worker: {
          enabled: boolean;
          configuredSpaceKeys: string[];
        };
        index: {
          documentCount: number;
          chunkCount: number;
          vectorRecordCount: number | null;
        };
        watermarks: Array<{ scopeKey: string }>;
        recentRuns: Array<{ target: { type: string } }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.environment).toBe("test");
    expect(body.syncStatus.worker.enabled).toBe(true);
    expect(body.syncStatus.worker.configuredSpaceKeys).toEqual(["ENG"]);
    expect(body.syncStatus.index.documentCount).toBe(1);
    expect(body.syncStatus.index.chunkCount).toBe(1);
    expect(body.syncStatus.index.vectorRecordCount).toBeNull();
    expect(body.syncStatus.watermarks.map((watermark) => watermark.scopeKey)).toEqual([
      "space:ENG",
    ]);
    expect(body.syncStatus.recentRuns[0]?.target.type).toBe("space");
  });

  it("rejects /sync-status without the configured API key", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          apiKey: "top-secret",
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/sync-status`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'ApiKey realm="confluence-mcp-sync-status"',
    );
    expect(body).toEqual({
      error: "Unauthorized.",
    });
  });
});
