import { describe, expect, it } from "vitest";

import { InMemorySyncStateStore } from "../../src/indexing/sync-state-store.js";

describe("InMemorySyncStateStore", () => {
  it("stores and returns watermarks by scope", () => {
    const store = new InMemorySyncStateStore();

    const watermark = store.upsertWatermark("space:ENG", "2026-04-08T10:00:00Z");

    expect(watermark.scopeKey).toBe("space:ENG");
    expect(store.getWatermark("space:ENG")).toEqual(watermark);
  });

  it("does not move watermarks backwards when an older timestamp is written later", () => {
    const store = new InMemorySyncStateStore();

    store.upsertWatermark("space:ENG", "2026-04-08T10:00:00Z");
    const watermark = store.upsertWatermark("space:ENG", "2026-04-08T09:00:00Z");

    expect(watermark.lastModified).toBe("2026-04-08T10:00:00Z");
    expect(store.getWatermark("space:ENG")?.lastModified).toBe("2026-04-08T10:00:00Z");
  });

  it("queues page, space, and full reindex runs", () => {
    const store = new InMemorySyncStateStore();

    const pageRun = store.createPageReindexRun("123", "manual");
    const spaceRun = store.createSpaceReindexRun("ENG", "bootstrap");
    const fullRun = store.createFullReindexRun("retry");

    expect(pageRun.target).toEqual({
      type: "page",
      pageId: "123",
    });
    expect(spaceRun.target).toEqual({
      type: "space",
      spaceKey: "ENG",
    });
    expect(fullRun.target).toEqual({
      type: "full",
    });
    expect(store.listRuns()).toHaveLength(3);
  });

  it("updates sync run lifecycle from queued to running to succeeded", () => {
    const store = new InMemorySyncStateStore();
    const run = store.createSpaceReindexRun("ENG", "manual");

    const runningRun = store.markRunRunning(run.runId);
    const succeededRun = store.markRunSucceeded(run.runId, {
      pagesDiscovered: 12,
      pagesIndexed: 11,
      pagesDeleted: 2,
      chunksProduced: 48,
    });

    expect(runningRun.status).toBe("running");
    expect(runningRun.startedAt).toBeTruthy();
    expect(succeededRun.status).toBe("succeeded");
    expect(succeededRun.finishedAt).toBeTruthy();
    expect(succeededRun.stats).toEqual({
      pagesDiscovered: 12,
      pagesIndexed: 11,
      pagesDeleted: 2,
      chunksProduced: 48,
    });
  });

  it("marks a run as failed with an error message", () => {
    const store = new InMemorySyncStateStore();
    const run = store.createFullReindexRun("manual");

    const failedRun = store.markRunFailed(run.runId, "Confluence API timed out.");

    expect(failedRun.status).toBe("failed");
    expect(failedRun.errorMessage).toBe("Confluence API timed out.");
    expect(failedRun.finishedAt).toBeTruthy();
  });
});
