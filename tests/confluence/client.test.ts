import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config.js";
import { ConfluenceClient } from "../../src/confluence/client.js";
import { runWithRequestContext } from "../../src/logging/request-context.js";

function createTestConfig(): AppConfig {
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
      runtimeAuth: {
        mode: "service_account",
        allowBaseUrlOverride: false,
      },
    },
    defaults: {
      topK: 10,
    },
    logLevel: "debug",
  };
}

describe("ConfluenceClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("forwards request and trace identifiers to Confluence and logs rate limit headers", async () => {
    const debug = vi.fn();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-limit": "100",
            "x-ratelimit-remaining": "99",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runWithRequestContext({ requestId: "req-456", traceId: "trace-789" }, () =>
      client.search('type = page AND space = "ENG"', 10),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(requestInit.headers).toMatchObject({
      Accept: "application/json",
      "X-Request-Id": "req-456",
      "X-Trace-Id": "trace-789",
    });
    expect(debug).toHaveBeenCalledWith(
      "Confluence request completed",
      expect.objectContaining({
        requestId: "req-456",
        traceId: "trace-789",
        rateLimitHeaders: {
          limit: "100",
          remaining: "99",
          nearLimit: null,
          reset: null,
          retryAfter: null,
        },
      }),
    );
  });

  it("calls the v2 ancestors endpoint for a page", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.getPageAncestors("123");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.atlassian.net/wiki/api/v2/pages/123/ancestors",
      }),
      expect.any(Object),
    );
  });

  it("calls the v2 spaces endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.getSpaces({
      limit: 25,
      cursor: "cursor-123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.atlassian.net/wiki/api/v2/spaces?limit=25&cursor=cursor-123",
      }),
      expect.any(Object),
    );
  });

  it("calls the v2 pages-in-space endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.getSpacePages("42", {
      limit: 25,
      cursor: "cursor-456",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.atlassian.net/wiki/api/v2/spaces/42/pages?limit=25&cursor=cursor-456",
      }),
      expect.any(Object),
    );
  });

  it("calls the v1 content restrictions endpoint for a page", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.getPageRestrictions("123");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.atlassian.net/wiki/rest/api/content/123/restriction/byOperation",
      }),
      expect.any(Object),
    );
  });

  it("calls the v2 descendants endpoint for a page", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.getPageDescendants("123", {
      limit: 25,
      depth: 2,
      cursor: "cursor-123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.atlassian.net/wiki/api/v2/pages/123/descendants?limit=25&cursor=cursor-123&depth=2",
      }),
      expect.any(Object),
    );
  });

  it("calls the v2 page attachments endpoint with filters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.getPageAttachments("123", {
      limit: 25,
      cursor: "cursor-456",
      filename: "release-notes.pdf",
      mediaType: "application/pdf",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.atlassian.net/wiki/api/v2/pages/123/attachments?limit=25&cursor=cursor-456&filename=release-notes.pdf&mediaType=application%2Fpdf",
      }),
      expect.any(Object),
    );
  });

  it("uses request-scoped Confluence credentials when they are present", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const config = createTestConfig();
    config.confluence.runtimeAuth = {
      mode: "prefer_user",
      allowBaseUrlOverride: false,
    };

    const client = new ConfluenceClient({
      config,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runWithRequestContext(
      {
        requestId: "req-user-1",
        traceId: "trace-user-1",
        confluenceAccess: {
          mode: "user",
          source: "x-confluence-email-token",
          fingerprint: "fp-user-123",
          baseUrl: "https://example.atlassian.net",
        },
        runtimeConfluenceAuth: {
          mode: "user",
          source: "x-confluence-email-token",
          baseUrl: "https://example.atlassian.net",
          wikiBaseUrl: "https://example.atlassian.net/wiki",
          email: "person@example.com",
          apiToken: "user-token",
          fingerprint: "fp-user-123",
        },
      },
      () => client.search('type = page AND space = "ENG"', 10),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(requestInit.headers?.Authorization).toBe(
      `Basic ${Buffer.from("person@example.com:user-token", "utf8").toString("base64")}`,
    );
  });

  it("ignores request-scoped Confluence credentials when runtime auth stays on service_account", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new ConfluenceClient({
      config: createTestConfig(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runWithRequestContext(
      {
        requestId: "req-user-ignore",
        traceId: "trace-user-ignore",
        confluenceAccess: {
          mode: "user",
          source: "x-confluence-email-token",
          fingerprint: "fp-user-ignore",
          baseUrl: "https://example.atlassian.net",
        },
        runtimeConfluenceAuth: {
          mode: "user",
          source: "x-confluence-email-token",
          baseUrl: "https://example.atlassian.net",
          wikiBaseUrl: "https://example.atlassian.net/wiki",
          email: "person@example.com",
          apiToken: "user-token",
          fingerprint: "fp-user-ignore",
        },
      },
      () => client.search('type = page AND space = "ENG"', 10),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(requestInit.headers?.Authorization).toBe(
      `Basic ${Buffer.from("user@example.com:token", "utf8").toString("base64")}`,
    );
  });

  it("requires request-scoped credentials for runtime requests when configured", async () => {
    const config = createTestConfig();
    config.confluence.runtimeAuth = {
      mode: "require_user",
      allowBaseUrlOverride: false,
    };

    const client = new ConfluenceClient({
      config,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await expect(
      runWithRequestContext(
        {
          requestId: "req-user-2",
          traceId: "trace-user-2",
          confluenceAccess: null,
          runtimeConfluenceAuth: null,
        },
        () => client.search('type = page AND space = "ENG"', 10),
      ),
    ).rejects.toMatchObject({
      name: "ConfluenceAuthError",
      status: 401,
    });
  });

  it("still uses the service account outside HTTP request context when require_user is enabled", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const config = createTestConfig();
    config.confluence.runtimeAuth = {
      mode: "require_user",
      allowBaseUrlOverride: false,
    };

    const client = new ConfluenceClient({
      config,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await client.search('type = page AND space = "ENG"', 10);

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(requestInit.headers?.Authorization).toBe(
      `Basic ${Buffer.from("user@example.com:token", "utf8").toString("base64")}`,
    );
  });
});
