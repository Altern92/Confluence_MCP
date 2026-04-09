import "dotenv/config";

import * as z from "zod/v4";

function emptyStringToUndefined(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function parseBooleanish(value: unknown, defaultValue: boolean): boolean {
  if (value == null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

function csvToArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolveAppEnv(rawAppEnv: string | undefined, rawNodeEnv: string | undefined) {
  const candidate = rawAppEnv ?? rawNodeEnv ?? "development";
  return z.enum(["development", "test", "production"]).parse(candidate);
}

function resolveAllowedHosts(appEnv: AppEnv, host: string, configuredHosts: string[]) {
  if (configuredHosts.length > 0) {
    return {
      values: configuredHosts,
      source: "configured" as const,
    };
  }

  if (appEnv === "production") {
    return {
      values: [],
      source: "none" as const,
    };
  }

  const devHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const normalizedHost = host.trim();

  if (normalizedHost.length > 0 && normalizedHost !== "0.0.0.0" && normalizedHost !== "::") {
    devHosts.add(normalizedHost);
  }

  return {
    values: [...devHosts],
    source: "development_defaults" as const,
  };
}

const envSchema = z.object({
  APP_ENV: z.string().optional(),
  NODE_ENV: z.string().optional(),
  MCP_TRANSPORT: z.enum(["http", "stdio"]).default("http"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  MCP_API_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  MCP_NEXT_API_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  METRICS_ENABLED: z.union([z.string(), z.boolean()]).optional(),
  MCP_MAX_REQUEST_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024)
    .default(256 * 1024),
  HTTP_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(5 * 60 * 1000)
    .default(30_000),
  CONFLUENCE_BASE_URL: z.string().url(),
  CONFLUENCE_EMAIL: z.string().min(1),
  CONFLUENCE_API_TOKEN: z.string().min(1),
  CONFLUENCE_ALLOWED_SPACE_KEYS: z.string().optional(),
  CONFLUENCE_ALLOWED_ROOT_PAGE_IDS: z.string().optional(),
  INDEXING_TENANT_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  INDEXING_STORAGE_DRIVER: z.enum(["memory", "file"]).default("memory"),
  INDEXING_STORAGE_PATH: z.string().min(1).default(".data/indexing"),
  INDEXING_CHUNK_MAX_CHARS: z.coerce.number().int().min(100).max(20_000).default(1200),
  INDEXING_CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).max(5_000).default(150),
  INDEXING_SYNC_ENABLED: z.union([z.string(), z.boolean()]).optional(),
  INDEXING_SYNC_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(24 * 60 * 60 * 1000)
    .default(5 * 60 * 1000),
  INDEXING_SYNC_SPACE_KEYS: z.string().optional(),
  INDEXING_SYNC_MAX_PAGES_PER_SPACE: z.coerce.number().int().min(1).max(10_000).default(500),
  INDEXING_SYNC_RUN_ON_STARTUP: z.union([z.string(), z.boolean()]).optional(),
  INDEXING_SYNC_FULL_RECONCILE_ENABLED: z.union([z.string(), z.boolean()]).optional(),
  INDEXING_SYNC_FULL_RECONCILE_INTERVAL_RUNS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(12),
  INDEXING_SYNC_FULL_RECONCILE_RUN_ON_STARTUP: z.union([z.string(), z.boolean()]).optional(),
  INDEXING_SEMANTIC_ENABLED: z.union([z.string(), z.boolean()]).optional(),
  INDEXING_EMBEDDING_PROVIDER: z.enum(["hash"]).default("hash"),
  INDEXING_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(32).max(4096).default(256),
  INDEXING_VECTOR_STORE_DRIVER: z.enum(["memory", "file", "postgres"]).default("memory"),
  INDEXING_VECTOR_STORE_PATH: z.string().min(1).default(".data/indexing/vectors.json"),
  INDEXING_VECTOR_STORE_POSTGRES_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional(),
  ),
  INDEXING_VECTOR_STORE_POSTGRES_SCHEMA: z.string().min(1).default("public"),
  INDEXING_VECTOR_STORE_POSTGRES_TABLE: z.string().min(1).default("confluence_semantic_chunks"),
  INDEXING_VECTOR_STORE_POSTGRES_SSL: z.union([z.string(), z.boolean()]).optional(),
  INDEXING_VECTOR_STORE_POSTGRES_AUTO_INIT: z.union([z.string(), z.boolean()]).optional(),
  DEFAULT_TOP_K: z.coerce.number().int().min(1).max(50).default(10),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppEnv = "development" | "test" | "production";

export type AppConfig = {
  app: {
    env: AppEnv;
    metricsEnabled: boolean;
  };
  transport: "http" | "stdio";
  server: {
    host: string;
    port: number;
    allowedHosts: string[];
    allowedHostsSource: "configured" | "development_defaults" | "none";
    allowedOrigins: string[];
    apiKey: string | null;
    nextApiKey: string | null;
    maxRequestBodyBytes: number;
    requestTimeoutMs: number;
  };
  confluence: {
    baseUrl: string;
    wikiBaseUrl: string;
    email: string;
    apiToken: string;
  };
  policy?: {
    allowedSpaceKeys: string[];
    allowedRootPageIds: string[];
  };
  indexing?: {
    tenantId: string | null;
    storage?: {
      driver: "memory" | "file";
      path: string;
    };
    chunking: {
      maxChars: number;
      overlapChars: number;
    };
    sync: {
      enabled: boolean;
      pollIntervalMs: number;
      spaceKeys: string[];
      maxPagesPerSpace: number;
      runOnStartup: boolean;
      fullReconcile: {
        enabled: boolean;
        intervalRuns: number;
        runOnStartup: boolean;
      };
    };
    semantic: {
      enabled: boolean;
      embeddingProvider: "hash";
      embeddingDimensions: number;
      vectorStoreDriver: "memory" | "file" | "postgres";
      vectorStorePath: string;
      postgres?: {
        connectionString: string | null;
        schema: string;
        table: string;
        ssl: boolean;
        autoInit: boolean;
      };
    };
  };
  defaults: {
    topK: number;
  };
  logLevel: "debug" | "info" | "warn" | "error";
};

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  const baseUrl = env.CONFLUENCE_BASE_URL.replace(/\/+$/, "");
  const wikiBaseUrl = new URL("/wiki/", `${baseUrl}/`).toString().replace(/\/$/, "");
  const appEnv = resolveAppEnv(env.APP_ENV, env.NODE_ENV);
  const allowedHosts = resolveAllowedHosts(appEnv, env.HOST, csvToArray(env.MCP_ALLOWED_HOSTS));

  return {
    app: {
      env: appEnv,
      metricsEnabled: parseBooleanish(env.METRICS_ENABLED, true),
    },
    transport: env.MCP_TRANSPORT,
    server: {
      host: env.HOST,
      port: env.PORT,
      allowedHosts: allowedHosts.values,
      allowedHostsSource: allowedHosts.source,
      allowedOrigins: csvToArray(env.MCP_ALLOWED_ORIGINS),
      apiKey: env.MCP_API_KEY ?? null,
      nextApiKey: env.MCP_NEXT_API_KEY ?? null,
      maxRequestBodyBytes: env.MCP_MAX_REQUEST_BODY_BYTES,
      requestTimeoutMs: env.HTTP_REQUEST_TIMEOUT_MS,
    },
    confluence: {
      baseUrl,
      wikiBaseUrl,
      email: env.CONFLUENCE_EMAIL,
      apiToken: env.CONFLUENCE_API_TOKEN,
    },
    policy: {
      allowedSpaceKeys: csvToArray(env.CONFLUENCE_ALLOWED_SPACE_KEYS).map((value) =>
        value.toUpperCase(),
      ),
      allowedRootPageIds: csvToArray(env.CONFLUENCE_ALLOWED_ROOT_PAGE_IDS),
    },
    indexing: {
      tenantId: env.INDEXING_TENANT_ID ?? null,
      storage: {
        driver: env.INDEXING_STORAGE_DRIVER,
        path: env.INDEXING_STORAGE_PATH,
      },
      chunking: {
        maxChars: env.INDEXING_CHUNK_MAX_CHARS,
        overlapChars: env.INDEXING_CHUNK_OVERLAP_CHARS,
      },
      sync: {
        enabled: parseBooleanish(env.INDEXING_SYNC_ENABLED, false),
        pollIntervalMs: env.INDEXING_SYNC_POLL_INTERVAL_MS,
        spaceKeys: csvToArray(env.INDEXING_SYNC_SPACE_KEYS),
        maxPagesPerSpace: env.INDEXING_SYNC_MAX_PAGES_PER_SPACE,
        runOnStartup: parseBooleanish(env.INDEXING_SYNC_RUN_ON_STARTUP, true),
        fullReconcile: {
          enabled: parseBooleanish(env.INDEXING_SYNC_FULL_RECONCILE_ENABLED, false),
          intervalRuns: env.INDEXING_SYNC_FULL_RECONCILE_INTERVAL_RUNS,
          runOnStartup: parseBooleanish(env.INDEXING_SYNC_FULL_RECONCILE_RUN_ON_STARTUP, false),
        },
      },
      semantic: {
        enabled: parseBooleanish(env.INDEXING_SEMANTIC_ENABLED, false),
        embeddingProvider: env.INDEXING_EMBEDDING_PROVIDER,
        embeddingDimensions: env.INDEXING_EMBEDDING_DIMENSIONS,
        vectorStoreDriver: env.INDEXING_VECTOR_STORE_DRIVER,
        vectorStorePath: env.INDEXING_VECTOR_STORE_PATH,
        postgres: {
          connectionString: env.INDEXING_VECTOR_STORE_POSTGRES_URL ?? null,
          schema: env.INDEXING_VECTOR_STORE_POSTGRES_SCHEMA,
          table: env.INDEXING_VECTOR_STORE_POSTGRES_TABLE,
          ssl: parseBooleanish(env.INDEXING_VECTOR_STORE_POSTGRES_SSL, false),
          autoInit: parseBooleanish(env.INDEXING_VECTOR_STORE_POSTGRES_AUTO_INIT, true),
        },
      },
    },
    defaults: {
      topK: env.DEFAULT_TOP_K,
    },
    logLevel: env.LOG_LEVEL,
  };
}

export function validateAppConfig(config: AppConfig) {
  if (
    config.app.env === "production" &&
    config.transport === "http" &&
    config.server.apiKey == null
  ) {
    throw new Error("MCP_API_KEY is required when APP_ENV=production and MCP_TRANSPORT=http.");
  }

  if (
    config.indexing?.semantic.enabled &&
    config.indexing.semantic.vectorStoreDriver === "postgres" &&
    !config.indexing.semantic.postgres?.connectionString
  ) {
    throw new Error(
      "INDEXING_VECTOR_STORE_POSTGRES_URL is required when semantic retrieval uses the postgres vector store.",
    );
  }

  const allowedSpaces = new Set(config.policy?.allowedSpaceKeys ?? []);
  const configuredSyncSpaces = config.indexing?.sync.spaceKeys ?? [];

  if (
    allowedSpaces.size > 0 &&
    configuredSyncSpaces.some((spaceKey) => !allowedSpaces.has(spaceKey.toUpperCase()))
  ) {
    throw new Error(
      "INDEXING_SYNC_SPACE_KEYS must be a subset of CONFLUENCE_ALLOWED_SPACE_KEYS when a space allowlist is configured.",
    );
  }
}
