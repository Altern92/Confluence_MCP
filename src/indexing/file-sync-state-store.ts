import * as z from "zod/v4";

import { readJsonFile, writeJsonFileAtomic } from "./file-storage.js";
import type { SyncStateStore } from "./storage-ports.js";
import { syncRunRecordSchema, syncWatermarkSchema } from "./sync-types.js";
import type { ReindexReason, SyncRunStats } from "./sync-types.js";
import { InMemorySyncStateStore } from "./sync-state-store.js";

const persistedSyncStateSchema = z.object({
  watermarks: z.array(syncWatermarkSchema).default([]),
  runs: z.array(syncRunRecordSchema).default([]),
});

export class FileSyncStateStore implements SyncStateStore {
  private delegate: InMemorySyncStateStore;

  constructor(private readonly filePath: string) {
    this.delegate = this.createDelegateFromDisk();
  }

  getWatermark(scopeKey: string) {
    this.reloadFromDisk();
    return this.delegate.getWatermark(scopeKey);
  }

  listWatermarks() {
    this.reloadFromDisk();
    return this.delegate.listWatermarks();
  }

  upsertWatermark(scopeKey: string, lastModified: string) {
    this.reloadFromDisk();
    const watermark = this.delegate.upsertWatermark(scopeKey, lastModified);
    this.persist();
    return watermark;
  }

  createPageReindexRun(pageId: string, reason: ReindexReason) {
    this.reloadFromDisk();
    const run = this.delegate.createPageReindexRun(pageId, reason);
    this.persist();
    return run;
  }

  createSpaceReindexRun(spaceKey: string, reason: ReindexReason) {
    this.reloadFromDisk();
    const run = this.delegate.createSpaceReindexRun(spaceKey, reason);
    this.persist();
    return run;
  }

  createFullReindexRun(reason: ReindexReason) {
    this.reloadFromDisk();
    const run = this.delegate.createFullReindexRun(reason);
    this.persist();
    return run;
  }

  getRun(runId: string) {
    this.reloadFromDisk();
    return this.delegate.getRun(runId);
  }

  listRuns() {
    this.reloadFromDisk();
    return this.delegate.listRuns();
  }

  markRunRunning(runId: string) {
    this.reloadFromDisk();
    const run = this.delegate.markRunRunning(runId);
    this.persist();
    return run;
  }

  markRunSucceeded(runId: string, stats: SyncRunStats) {
    this.reloadFromDisk();
    const run = this.delegate.markRunSucceeded(runId, stats);
    this.persist();
    return run;
  }

  markRunFailed(runId: string, errorMessage: string) {
    this.reloadFromDisk();
    const run = this.delegate.markRunFailed(runId, errorMessage);
    this.persist();
    return run;
  }

  private persist() {
    writeJsonFileAtomic(this.filePath, {
      watermarks: this.delegate.listWatermarks(),
      runs: this.delegate.listRuns(),
    });
  }

  private reloadFromDisk() {
    this.delegate = this.createDelegateFromDisk();
  }

  private createDelegateFromDisk() {
    const parsed = persistedSyncStateSchema.parse(
      readJsonFile(this.filePath, {
        watermarks: [],
        runs: [],
      }),
    );
    const delegate = new InMemorySyncStateStore();

    for (const watermark of parsed.watermarks) {
      delegate.restoreWatermark(watermark);
    }

    for (const run of parsed.runs) {
      delegate.restoreRun(run);
    }

    return delegate;
  }
}
