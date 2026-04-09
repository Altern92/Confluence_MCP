import { randomUUID } from "node:crypto";

import type { ReindexReason, SyncRunRecord, SyncRunStats, SyncWatermark } from "./sync-types.js";
import type { ReindexTarget } from "./sync-types.js";
import type { SyncStateStore } from "./storage-ports.js";

function nowIsoString() {
  return new Date().toISOString();
}

function pickLatestIsoTimestamp(left: string | null | undefined, right: string) {
  if (!left) {
    return right;
  }

  return left.localeCompare(right) >= 0 ? left : right;
}

export class InMemorySyncStateStore implements SyncStateStore {
  private readonly watermarks = new Map<string, SyncWatermark>();
  private readonly runs = new Map<string, SyncRunRecord>();

  getWatermark(scopeKey: string) {
    return this.watermarks.get(scopeKey) ?? null;
  }

  listWatermarks() {
    return [...this.watermarks.values()].sort((left, right) =>
      left.scopeKey.localeCompare(right.scopeKey),
    );
  }

  upsertWatermark(scopeKey: string, lastModified: string): SyncWatermark {
    const previous = this.watermarks.get(scopeKey) ?? null;
    const watermark: SyncWatermark = {
      scopeKey,
      lastModified: pickLatestIsoTimestamp(previous?.lastModified, lastModified),
      updatedAt: nowIsoString(),
    };

    this.watermarks.set(scopeKey, watermark);
    return watermark;
  }

  createPageReindexRun(pageId: string, reason: ReindexReason) {
    return this.queueRun({ type: "page", pageId }, reason);
  }

  createSpaceReindexRun(spaceKey: string, reason: ReindexReason) {
    return this.queueRun({ type: "space", spaceKey }, reason);
  }

  createFullReindexRun(reason: ReindexReason) {
    return this.queueRun({ type: "full" }, reason);
  }

  getRun(runId: string) {
    return this.runs.get(runId) ?? null;
  }

  listRuns() {
    return [...this.runs.values()].sort((left, right) =>
      right.queuedAt.localeCompare(left.queuedAt),
    );
  }

  restoreWatermark(watermark: SyncWatermark) {
    this.watermarks.set(watermark.scopeKey, watermark);
  }

  restoreRun(run: SyncRunRecord) {
    this.runs.set(run.runId, run);
  }

  markRunRunning(runId: string) {
    const run = this.requireRun(runId);
    const updated: SyncRunRecord = {
      ...run,
      status: "running",
      startedAt: run.startedAt ?? nowIsoString(),
      errorMessage: null,
    };

    this.runs.set(runId, updated);
    return updated;
  }

  markRunSucceeded(runId: string, stats: SyncRunStats) {
    const run = this.requireRun(runId);
    const updated: SyncRunRecord = {
      ...run,
      status: "succeeded",
      startedAt: run.startedAt ?? nowIsoString(),
      finishedAt: nowIsoString(),
      stats,
      errorMessage: null,
    };

    this.runs.set(runId, updated);
    return updated;
  }

  markRunFailed(runId: string, errorMessage: string) {
    const run = this.requireRun(runId);
    const updated: SyncRunRecord = {
      ...run,
      status: "failed",
      startedAt: run.startedAt ?? nowIsoString(),
      finishedAt: nowIsoString(),
      errorMessage,
    };

    this.runs.set(runId, updated);
    return updated;
  }

  private queueRun(target: ReindexTarget, reason: ReindexReason): SyncRunRecord {
    const queuedRun: SyncRunRecord = {
      runId: randomUUID(),
      target,
      reason,
      status: "queued",
      queuedAt: nowIsoString(),
      startedAt: null,
      finishedAt: null,
      stats: null,
      errorMessage: null,
    };

    this.runs.set(queuedRun.runId, queuedRun);
    return queuedRun;
  }

  private requireRun(runId: string): SyncRunRecord {
    const run = this.runs.get(runId);

    if (!run) {
      throw new Error(`Sync run ${runId} was not found.`);
    }

    return run;
  }
}
