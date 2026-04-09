import * as z from "zod/v4";

import type { AppContext } from "../app/context.js";

export function logStartupSummary(context: AppContext) {
  context.logger.info("Loaded Confluence MCP configuration", {
    app: {
      env: context.config.app.env,
      metricsEnabled: context.config.app.metricsEnabled,
    },
    transport: context.config.transport,
    server: {
      host: context.config.server.host,
      port: context.config.server.port,
      allowedHostsCount: context.config.server.allowedHosts.length,
      allowedHostsSource: context.config.server.allowedHostsSource,
      allowedOriginsCount: context.config.server.allowedOrigins.length,
      apiKeyAuthEnabled: context.config.server.apiKey != null,
      apiKeyRotationEnabled: context.config.server.nextApiKey != null,
      apiKeyPrimaryHeader: "X-API-Key",
      apiKeyCompatibilityHeader: "Authorization: ApiKey ...",
      maxRequestBodyBytes: context.config.server.maxRequestBodyBytes,
      requestTimeoutMs: context.config.server.requestTimeoutMs,
    },
    confluence: {
      baseUrl: context.config.confluence.baseUrl,
      emailConfigured: context.config.confluence.email.length > 0,
      apiTokenConfigured: context.config.confluence.apiToken.length > 0,
    },
    indexing: {
      tenantConfigured: context.config.indexing?.tenantId != null,
      storageDriver: context.indexingStoreDriver,
      storagePath: context.indexingStoragePath,
      chunking: context.config.indexing?.chunking ?? null,
      syncEnabled: context.config.indexing?.sync.enabled ?? false,
      syncSpaceCount: context.config.indexing?.sync.spaceKeys.length ?? 0,
      syncPollIntervalMs: context.config.indexing?.sync.pollIntervalMs ?? null,
      syncRunOnStartup: context.config.indexing?.sync.runOnStartup ?? null,
      syncMaxPagesPerSpace: context.config.indexing?.sync.maxPagesPerSpace ?? null,
      syncFullReconcileEnabled: context.config.indexing?.sync.fullReconcile.enabled ?? false,
      syncFullReconcileIntervalRuns:
        context.config.indexing?.sync.fullReconcile.intervalRuns ?? null,
      syncFullReconcileRunOnStartup:
        context.config.indexing?.sync.fullReconcile.runOnStartup ?? null,
      semanticEnabled: context.config.indexing?.semantic.enabled ?? false,
      embeddingProvider: context.config.indexing?.semantic.embeddingProvider ?? null,
      embeddingDimensions: context.config.indexing?.semantic.embeddingDimensions ?? null,
      vectorStoreDriver: context.config.indexing?.semantic.vectorStoreDriver ?? null,
      vectorStorePath: context.config.indexing?.semantic.vectorStorePath ?? null,
      vectorStorePostgresConfigured:
        context.config.indexing?.semantic.postgres?.connectionString != null,
      vectorStorePostgresSchema: context.config.indexing?.semantic.postgres?.schema ?? null,
      vectorStorePostgresTable: context.config.indexing?.semantic.postgres?.table ?? null,
      vectorStorePostgresAutoInit: context.config.indexing?.semantic.postgres?.autoInit ?? null,
    },
    defaults: context.config.defaults,
    logLevel: context.config.logLevel,
  });
}

export function logStartupWarnings(context: AppContext) {
  if (
    context.config.app.env === "production" &&
    context.config.transport === "http" &&
    context.config.server.allowedHosts.length === 0
  ) {
    context.logger.warn("Production HTTP mode is running without MCP_ALLOWED_HOSTS restrictions.", {
      appEnv: context.config.app.env,
      transport: context.config.transport,
    });
  }

  if (
    context.config.app.env !== "production" &&
    context.config.server.allowedHostsSource === "development_defaults"
  ) {
    context.logger.info("Applied development-safe default allowed hosts.", {
      allowedHosts: context.config.server.allowedHosts,
    });
  }

  if (
    context.config.indexing?.sync.enabled &&
    context.config.indexing.sync.spaceKeys.length === 0
  ) {
    context.logger.warn(
      "Incremental sync is enabled but no INDEXING_SYNC_SPACE_KEYS are configured.",
    );
  }

  if (
    context.config.indexing?.sync.fullReconcile.enabled &&
    context.config.indexing.sync.enabled === false
  ) {
    context.logger.warn("Full reconciliation is enabled but incremental sync worker is disabled.");
  }
}

export function formatStartupError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const details = error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `- ${path}: ${issue.message}`;
      })
      .join("\n");

    return `Invalid environment configuration:\n${details}`;
  }

  if (error instanceof Error) {
    return `Failed to start Confluence MCP server: ${error.message}`;
  }

  return `Failed to start Confluence MCP server: ${String(error)}`;
}
