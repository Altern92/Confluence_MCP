import type { Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { closeServer, createTestContext, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: http security middleware", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (!server) {
        continue;
      }

      await closeServer(server);
    }
  });

  it("rejects /mcp requests without the configured API key", async () => {
    const context = createTestContext({
      config: {
        ...createTestContext().config,
        server: {
          ...createTestContext().config.server,
          apiKey: "top-secret",
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('ApiKey realm="confluence-mcp"');
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized.",
      },
      id: null,
    });
  });

  it("accepts /mcp requests with x-api-key when an API key is configured", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          apiKey: "top-secret",
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "top-secret",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
  });

  it("accepts /mcp requests with Authorization: ApiKey for compatibility", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          apiKey: "top-secret",
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "ApiKey top-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
  });

  it("rejects /mcp requests with the wrong API key", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          apiKey: "top-secret",
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {},
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized.",
      },
      id: null,
    });
  });

  it("accepts the next API key during rotation", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          apiKey: "active-key",
          nextApiKey: "next-key",
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "next-key",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
  });

  it("rejects /mcp requests from non-allowlisted origins", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          allowedOrigins: ["https://chatgpt.com"],
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`, {
      headers: {
        Origin: "https://evil.example",
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Origin is not allowed.",
      },
      id: null,
    });
  });

  it("rejects /mcp requests that exceed the configured body limit", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          maxRequestBodyBytes: 64,
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {
          padding: "x".repeat(512),
        },
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(413);
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Request body too large.",
      },
      id: null,
    });
  });
});
