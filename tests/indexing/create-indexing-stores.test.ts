import type { AppConfig } from "../../src/config.js";
import { createIndexingStores } from "../../src/indexing/create-indexing-stores.js";
import { describe, expect, it } from "vitest";

function createTestConfig(driver: "memory" | "file"): AppConfig {
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
      apiKey: null,
      nextApiKey: null,
      maxRequestBodyBytes: 256 * 1024,
      requestTimeoutMs: 30_000,
    },
    confluence: {
      baseUrl: "https://example.atlassian.net",
      wikiBaseUrl: "https://example.atlassian.net/wiki",
      email: "user@example.com",
      apiToken: "token",
    },
    indexing: {
      tenantId: "tenant-a",
      storage: {
        driver,
        path: ".data/indexing-test",
      },
      chunking: {
        maxChars: 1200,
        overlapChars: 150,
      },
      sync: {
        enabled: false,
        pollIntervalMs: 300_000,
        spaceKeys: [],
        maxPagesPerSpace: 500,
        runOnStartup: true,
        fullReconcile: {
          enabled: false,
          intervalRuns: 12,
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
    defaults: {
      topK: 10,
    },
    logLevel: "error",
  };
}

describe("createIndexingStores", () => {
  it("creates in-memory stores by default", () => {
    const stores = createIndexingStores(createTestConfig("memory"));

    expect(stores.driver).toBe("memory");
    expect(stores.storagePath).toBeNull();
  });

  it("creates file-backed stores when configured", () => {
    const stores = createIndexingStores(createTestConfig("file"));

    expect(stores.driver).toBe("file");
    expect(stores.storagePath).toBe(".data/indexing-test");
  });
});
