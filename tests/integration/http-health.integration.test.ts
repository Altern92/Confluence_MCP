import type { Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { closeServer, createTestContext, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: http health endpoints", () => {
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

  it("returns health information from /health", async () => {
    const server = await startTestServer(createTestContext());
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      transport: "http",
      mcpPath: "/mcp",
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("x-trace-id")).toBeTruthy();
  });

  it("returns readiness information from /ready", async () => {
    const server = await startTestServer(createTestContext());
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/ready`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ready",
      transport: "http",
      mcpPath: "/mcp",
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("x-trace-id")).toBeTruthy();
  });

  it("reuses an incoming X-Trace-Id header on /health", async () => {
    const server = await startTestServer(createTestContext());
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/health`, {
      headers: {
        "x-trace-id": "trace-health-123",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-trace-id")).toBe("trace-health-123");
  });
});
