import type { AppConfig } from "../config.js";
import type { Logger } from "../logging/logger.js";
import type { MetricsRegistry } from "../observability/metrics-registry.js";
import { resolvePermittedSpaceKeys } from "../security/access-policy.js";
import type { FullSyncCoordinator } from "./full-sync-coordinator.js";
import type { SpaceIncrementalSyncCoordinator } from "./space-incremental-sync-coordinator.js";

type SyncTrigger = "startup" | "scheduled" | "manual";

export type IncrementalSyncRunSummary = {
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string;
  processedSpaceKeys: string[];
  failedSpaceKeys: string[];
  fullReconciliationPerformed: boolean;
  fullReconciliationSucceeded: boolean | null;
  reconciledSpaceKeys: string[];
  durationMs: number;
};

type SpaceIncrementalSyncCoordinatorPort = Pick<SpaceIncrementalSyncCoordinator, "syncSpace">;
type FullSyncCoordinatorPort = Pick<FullSyncCoordinator, "syncAll">;

function nowIsoString() {
  return new Date().toISOString();
}

function toLagSeconds(lastModified: string) {
  return Math.max(0, Math.floor((Date.now() - Date.parse(lastModified)) / 1000));
}

export class IncrementalSyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<IncrementalSyncRunSummary> | null = null;
  private completedRunCount = 0;
  private lastRunSummary: IncrementalSyncRunSummary | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly metrics: MetricsRegistry,
    private readonly coordinator: SpaceIncrementalSyncCoordinatorPort,
    private readonly fullSyncCoordinator?: FullSyncCoordinatorPort,
  ) {}

  isEnabled() {
    return Boolean(this.config.indexing?.sync.enabled);
  }

  getConfiguredSpaceKeys() {
    return resolvePermittedSpaceKeys(this.config, this.config.indexing?.sync.spaceKeys) ?? [];
  }

  getStatusSnapshot() {
    return {
      hasActiveRun: this.activeRun != null,
      completedRunCount: this.completedRunCount,
      lastRunSummary: this.lastRunSummary,
    };
  }

  start() {
    if (!this.isEnabled()) {
      this.logger.info("Incremental sync worker is disabled.");
      return false;
    }

    if (this.timer) {
      return true;
    }

    const spaceKeys = this.getConfiguredSpaceKeys();

    if (spaceKeys.length === 0) {
      this.logger.warn("Incremental sync worker was not started because no spaces are configured.");
      return false;
    }

    const pollIntervalMs = this.config.indexing?.sync.pollIntervalMs ?? 5 * 60 * 1000;

    if (this.config.indexing?.sync.runOnStartup ?? true) {
      void this.runOnce("startup");
    }

    this.timer = setInterval(() => {
      void this.runOnce("scheduled");
    }, pollIntervalMs);
    this.timer.unref?.();

    this.logger.info("Incremental sync worker started", {
      pollIntervalMs,
      spaceKeys,
      maxPagesPerSpace: this.config.indexing?.sync.maxPagesPerSpace ?? null,
    });

    return true;
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.activeRun) {
      await this.activeRun;
    }

    this.logger.info("Incremental sync worker stopped");
  }

  async runOnce(trigger: SyncTrigger = "manual"): Promise<IncrementalSyncRunSummary> {
    if (this.activeRun) {
      this.logger.warn("Skipping overlapping incremental sync run", {
        trigger,
      });
      return this.activeRun;
    }

    this.activeRun = this.executeRun(trigger).finally(() => {
      this.activeRun = null;
    });

    return this.activeRun;
  }

  private async executeRun(trigger: SyncTrigger): Promise<IncrementalSyncRunSummary> {
    const startedAt = nowIsoString();
    const startedAtMs = Date.now();
    const processedSpaceKeys: string[] = [];
    const failedSpaceKeys: string[] = [];
    let fullReconciliationPerformed = false;
    let fullReconciliationSucceeded: boolean | null = null;
    let reconciledSpaceKeys: string[] = [];
    const spaceKeys = this.getConfiguredSpaceKeys();

    this.logger.info("Starting incremental sync worker run", {
      trigger,
      spaceKeys,
    });

    for (const spaceKey of spaceKeys) {
      try {
        const result = await this.coordinator.syncSpace({
          spaceKey,
          tenantId: this.config.indexing?.tenantId ?? null,
          reason: "content_changed",
          maxPages: this.config.indexing?.sync.maxPagesPerSpace,
          chunking: this.config.indexing?.chunking,
        });

        processedSpaceKeys.push(spaceKey);
        this.metrics.incrementCounter("sync_runs_total", {
          trigger,
          scope: "space",
          outcome: "success",
          spaceKey,
        });

        if (result.watermark?.lastModified) {
          this.metrics.setGauge("sync_lag_seconds", toLagSeconds(result.watermark.lastModified), {
            scope: "space",
            spaceKey,
          });
        }
      } catch (error) {
        failedSpaceKeys.push(spaceKey);
        this.metrics.incrementCounter("sync_runs_total", {
          trigger,
          scope: "space",
          outcome: "error",
          spaceKey,
        });
        this.logger.error("Incremental sync failed for space", {
          trigger,
          spaceKey,
          error,
        });
      }
    }

    if (this.shouldRunFullReconciliation(trigger)) {
      fullReconciliationPerformed = true;
      const reconcileStartedAtMs = Date.now();

      try {
        const result = await this.fullSyncCoordinator?.syncAll({
          tenantId: this.config.indexing?.tenantId ?? null,
          spaceKeys,
          maxPagesPerSpace: this.config.indexing?.sync.maxPagesPerSpace,
          chunking: this.config.indexing?.chunking,
          reason: "bootstrap",
        });

        fullReconciliationSucceeded = true;
        reconciledSpaceKeys = result?.processedSpaceKeys ?? [];
        this.metrics.incrementCounter("sync_runs_total", {
          trigger,
          scope: "full",
          outcome: "success",
        });
        this.metrics.observeSummary("sync_run_duration_ms", Date.now() - reconcileStartedAtMs, {
          trigger,
          scope: "full",
          outcome: "success",
        });
      } catch (error) {
        fullReconciliationSucceeded = false;
        this.metrics.incrementCounter("sync_runs_total", {
          trigger,
          scope: "full",
          outcome: "error",
        });
        this.metrics.observeSummary("sync_run_duration_ms", Date.now() - reconcileStartedAtMs, {
          trigger,
          scope: "full",
          outcome: "error",
        });
        this.logger.error("Full reconciliation sync failed", {
          trigger,
          error,
        });
      }
    }

    const durationMs = Date.now() - startedAtMs;
    const finishedAt = nowIsoString();
    this.completedRunCount += 1;

    this.metrics.observeSummary("sync_run_duration_ms", durationMs, {
      trigger,
      scope: "worker",
      outcome:
        failedSpaceKeys.length > 0 || fullReconciliationSucceeded === false ? "partial" : "success",
    });

    const summary: IncrementalSyncRunSummary = {
      trigger,
      startedAt,
      finishedAt,
      processedSpaceKeys,
      failedSpaceKeys,
      fullReconciliationPerformed,
      fullReconciliationSucceeded,
      reconciledSpaceKeys,
      durationMs,
    };

    this.lastRunSummary = summary;

    this.logger.info("Incremental sync worker run completed", summary);

    return summary;
  }

  private shouldRunFullReconciliation(trigger: SyncTrigger) {
    const fullReconcileConfig = this.config.indexing?.sync.fullReconcile;

    if (!fullReconcileConfig?.enabled || !this.fullSyncCoordinator) {
      return false;
    }

    if (trigger === "startup" && fullReconcileConfig.runOnStartup) {
      return true;
    }

    return (this.completedRunCount + 1) % fullReconcileConfig.intervalRuns === 0;
  }
}
