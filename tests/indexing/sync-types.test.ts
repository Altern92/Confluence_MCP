import { describe, expect, it } from "vitest";

import {
  reindexTargetSchema,
  syncRunRecordSchema,
  syncRunStatsSchema,
  syncWatermarkSchema,
} from "../../src/indexing/sync-types.js";

describe("indexing/sync-types", () => {
  it("validates page, space, and full reindex targets", () => {
    expect(reindexTargetSchema.parse({ type: "page", pageId: "123" })).toEqual({
      type: "page",
      pageId: "123",
    });
    expect(reindexTargetSchema.parse({ type: "space", spaceKey: "ENG" })).toEqual({
      type: "space",
      spaceKey: "ENG",
    });
    expect(reindexTargetSchema.parse({ type: "full" })).toEqual({
      type: "full",
    });
  });

  it("validates sync watermark records", () => {
    expect(
      syncWatermarkSchema.parse({
        scopeKey: "space:ENG",
        lastModified: "2026-04-08T10:00:00Z",
        updatedAt: "2026-04-08T10:05:00Z",
      }),
    ).toEqual({
      scopeKey: "space:ENG",
      lastModified: "2026-04-08T10:00:00Z",
      updatedAt: "2026-04-08T10:05:00Z",
    });
  });

  it("validates sync run stats including deleted pages", () => {
    expect(
      syncRunStatsSchema.parse({
        pagesDiscovered: 5,
        pagesIndexed: 4,
        pagesDeleted: 1,
        chunksProduced: 12,
      }),
    ).toEqual({
      pagesDiscovered: 5,
      pagesIndexed: 4,
      pagesDeleted: 1,
      chunksProduced: 12,
    });
  });

  it("validates sync run records", () => {
    expect(
      syncRunRecordSchema.parse({
        runId: "run-123",
        target: {
          type: "space",
          spaceKey: "ENG",
        },
        reason: "manual",
        status: "queued",
        queuedAt: "2026-04-08T10:00:00Z",
        startedAt: null,
        finishedAt: null,
        stats: null,
        errorMessage: null,
      }),
    ).toMatchObject({
      runId: "run-123",
      reason: "manual",
      status: "queued",
    });
  });
});
