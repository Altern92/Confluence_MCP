import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { loadConfig, validateAppConfig } from "../src/config.js";

function createBaseConfig(): AppConfig {
  return {
    app: {
      env: "test",
      metricsEnabled: true,
    },
    transport: "http",
    server: {
      host: "127.0.0.1",
      port: 3000,
      allowedHosts: [],
      allowedHostsSource: "configured",
      allowedOrigins: [],
      apiKey: "top-secret",
      nextApiKey: null,
      maxRequestBodyBytes: 256 * 1024,
      requestTimeoutMs: 30_000,
    },
    confluence: {
      baseUrl: "https://example.atlassian.net",
      wikiBaseUrl: "https://example.atlassian.net/wiki",
      email: "user@example.com",
      apiToken: "token",
      runtimeAuth: {
        mode: "service_account",
        allowBaseUrlOverride: false,
      },
    },
    policy: {
      allowedSpaceKeys: [],
      allowedRootPageIds: [],
    },
    indexing: {
      tenantId: null,
      storage: {
        driver: "memory",
        path: ".data/indexing-test",
      },
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
      sync: {
        enabled: false,
        pollIntervalMs: 60_000,
        spaceKeys: [],
        maxPagesPerSpace: 100,
        runOnStartup: false,
        fullReconcile: {
          enabled: false,
          intervalRuns: 12,
          runOnStartup: false,
        },
      },
      semantic: {
        enabled: true,
        embeddingProvider: "hash",
        embeddingDimensions: 256,
        vectorStoreDriver: "postgres",
        vectorStorePath: ".data/indexing-test/vectors.json",
        postgres: {
          connectionString: null,
          schema: "public",
          table: "semantic_chunks",
          ssl: false,
          autoInit: true,
        },
      },
    },
    defaults: {
      topK: 10,
    },
    logLevel: "info",
  };
}

describe("validateAppConfig", () => {
  it("rejects semantic postgres vector store without a connection string", () => {
    expect(() => validateAppConfig(createBaseConfig())).toThrow(
      "INDEXING_VECTOR_STORE_POSTGRES_URL is required when semantic retrieval uses the postgres vector store.",
    );
  });

  it("accepts semantic postgres vector store when a connection string is provided", () => {
    const config = createBaseConfig();

    if (!config.indexing?.semantic.postgres) {
      throw new Error("Missing postgres config in test fixture.");
    }

    config.indexing.semantic.postgres.connectionString =
      "postgres://postgres:postgres@localhost:5432/confluence_mcp";

    expect(() => validateAppConfig(config)).not.toThrow();
  });

  it("rejects sync spaces outside the configured Confluence space allowlist", () => {
    const config = createBaseConfig();
    config.policy = {
      allowedSpaceKeys: ["OPS"],
      allowedRootPageIds: [],
    };
    config.indexing!.semantic.postgres!.connectionString =
      "postgres://postgres:postgres@localhost:5432/confluence_mcp";
    config.indexing!.sync.spaceKeys = ["ENG"];

    expect(() => validateAppConfig(config)).toThrow(
      "INDEXING_SYNC_SPACE_KEYS must be a subset of CONFLUENCE_ALLOWED_SPACE_KEYS when a space allowlist is configured.",
    );
  });
});

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("treats empty optional string env vars as undefined", () => {
    process.env = {
      ...originalEnv,
      APP_ENV: "development",
      MCP_TRANSPORT: "http",
      HOST: "127.0.0.1",
      PORT: "3000",
      MCP_API_KEY: "local-key",
      MCP_NEXT_API_KEY: "",
      CONFLUENCE_BASE_URL: "https://example.atlassian.net",
      CONFLUENCE_EMAIL: "user@example.com",
      CONFLUENCE_API_TOKEN: "token",
      INDEXING_TENANT_ID: "",
      INDEXING_STORAGE_DRIVER: "file",
      INDEXING_STORAGE_PATH: ".data/indexing",
      INDEXING_SYNC_ENABLED: "false",
      INDEXING_SYNC_POLL_INTERVAL_MS: "300000",
      INDEXING_SYNC_MAX_PAGES_PER_SPACE: "500",
      INDEXING_SYNC_RUN_ON_STARTUP: "false",
      INDEXING_SYNC_FULL_RECONCILE_ENABLED: "false",
      INDEXING_SYNC_FULL_RECONCILE_INTERVAL_RUNS: "12",
      INDEXING_SYNC_FULL_RECONCILE_RUN_ON_STARTUP: "false",
      INDEXING_SEMANTIC_ENABLED: "true",
      INDEXING_EMBEDDING_PROVIDER: "hash",
      INDEXING_EMBEDDING_DIMENSIONS: "256",
      INDEXING_VECTOR_STORE_DRIVER: "file",
      INDEXING_VECTOR_STORE_PATH: ".data/indexing/vectors.json",
      INDEXING_VECTOR_STORE_POSTGRES_URL: "",
      DEFAULT_TOP_K: "10",
      LOG_LEVEL: "info",
    };

    const config = loadConfig();

    expect(config.server.nextApiKey).toBeNull();
    expect(config.indexing?.tenantId).toBeNull();
    expect(config.indexing?.semantic.postgres?.connectionString).toBeNull();
  });

  it("loads Confluence space and root page allowlists from environment", () => {
    process.env = {
      ...originalEnv,
      APP_ENV: "development",
      MCP_TRANSPORT: "http",
      HOST: "127.0.0.1",
      PORT: "3000",
      MCP_API_KEY: "local-key",
      CONFLUENCE_BASE_URL: "https://example.atlassian.net",
      CONFLUENCE_EMAIL: "user@example.com",
      CONFLUENCE_API_TOKEN: "token",
      CONFLUENCE_ALLOWED_SPACE_KEYS: "eng, OPS ",
      CONFLUENCE_ALLOWED_ROOT_PAGE_IDS: "123, 456",
      CONFLUENCE_RUNTIME_AUTH_MODE: "require_user",
      CONFLUENCE_RUNTIME_ALLOW_BASE_URL_OVERRIDE: "true",
      INDEXING_STORAGE_DRIVER: "memory",
      INDEXING_STORAGE_PATH: ".data/indexing",
      INDEXING_SYNC_ENABLED: "false",
      INDEXING_SYNC_POLL_INTERVAL_MS: "300000",
      INDEXING_SYNC_MAX_PAGES_PER_SPACE: "500",
      INDEXING_SYNC_RUN_ON_STARTUP: "false",
      INDEXING_SYNC_FULL_RECONCILE_ENABLED: "false",
      INDEXING_SYNC_FULL_RECONCILE_INTERVAL_RUNS: "12",
      INDEXING_SYNC_FULL_RECONCILE_RUN_ON_STARTUP: "false",
      INDEXING_SEMANTIC_ENABLED: "false",
      INDEXING_EMBEDDING_PROVIDER: "hash",
      INDEXING_EMBEDDING_DIMENSIONS: "256",
      INDEXING_VECTOR_STORE_DRIVER: "memory",
      INDEXING_VECTOR_STORE_PATH: ".data/indexing/vectors.json",
      DEFAULT_TOP_K: "10",
      LOG_LEVEL: "info",
    };

    const config = loadConfig();

    expect(config.policy).toEqual({
      allowedSpaceKeys: ["ENG", "OPS"],
      allowedRootPageIds: ["123", "456"],
    });
    expect(config.confluence.runtimeAuth).toEqual({
      mode: "require_user",
      allowBaseUrlOverride: true,
    });
  });
});
