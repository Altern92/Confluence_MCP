import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { FileSyncStateStore } from "../../src/indexing/file-sync-state-store.js";

const directories: string[] = [];

function createStorePath() {
  const directory = mkdtempSync(join(tmpdir(), "confluence-mcp-sync-"));
  directories.push(directory);
  return join(directory, "sync-state.json");
}

afterEach(() => {
  for (const directory of directories.splice(0, directories.length)) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }
});

describe("FileSyncStateStore", () => {
  it("persists watermarks across store instances", () => {
    const filePath = createStorePath();
    const store = new FileSyncStateStore(filePath);

    store.upsertWatermark("space:ENG", "2026-04-09T08:00:00Z");

    const reloadedStore = new FileSyncStateStore(filePath);

    expect(reloadedStore.getWatermark("space:ENG")?.lastModified).toBe("2026-04-09T08:00:00Z");
  });

  it("persists run lifecycle updates across store instances", () => {
    const filePath = createStorePath();
    const store = new FileSyncStateStore(filePath);
    const run = store.createSpaceReindexRun("ENG", "manual");

    store.markRunRunning(run.runId);
    store.markRunSucceeded(run.runId, {
      pagesDiscovered: 2,
      pagesIndexed: 2,
      pagesDeleted: 1,
      chunksProduced: 5,
    });

    const reloadedStore = new FileSyncStateStore(filePath);
    const persistedRun = reloadedStore.getRun(run.runId);

    expect(persistedRun?.status).toBe("succeeded");
    expect(persistedRun?.stats).toEqual({
      pagesDiscovered: 2,
      pagesIndexed: 2,
      pagesDeleted: 1,
      chunksProduced: 5,
    });
  });

  it("refreshes reads after another store instance updates the same file", () => {
    const filePath = createStorePath();
    const longLivedStore = new FileSyncStateStore(filePath);
    const externalWriter = new FileSyncStateStore(filePath);

    externalWriter.upsertWatermark("space:ENG", "2026-04-09T08:00:00Z");

    expect(longLivedStore.getWatermark("space:ENG")?.lastModified).toBe("2026-04-09T08:00:00Z");
  });
});
