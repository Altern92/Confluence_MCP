import type { Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { closeServer, createTestContext, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: http metrics endpoint", () => {
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

  it("returns a metrics snapshot when enabled and authorized", async () => {
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

    context.metrics.recordToolInvocation({
      toolName: "confluence.search",
      outcome: "success",
      durationMs: 42,
    });
    context.metrics.recordConfluenceRequest({
      method: "GET",
      route: "/wiki/rest/api/search",
      status: 200,
      latencyMs: 12,
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/metrics`, {
      headers: {
        "x-api-key": "top-secret",
      },
    });
    const body = (await response.json()) as {
      environment: string;
      metrics: {
        generatedAt: string;
        counters: Array<{ name: string; tags: Record<string, string>; value: number }>;
        gauges: Array<{ name: string; tags: Record<string, string>; value: number }>;
        summaries: Array<{
          name: string;
          tags: Record<string, string>;
          count: number;
          sum: number;
          min: number;
          max: number;
          avg: number;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.environment).toBe("test");
    expect(body.metrics.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(body.metrics.gauges)).toBe(true);
    expect(body.metrics.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "confluence_requests_total",
          value: 1,
        }),
        expect.objectContaining({
          name: "tool_invocations_total",
          value: 1,
        }),
      ]),
    );
    expect(body.metrics.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "confluence_request_latency_ms",
          count: 1,
        }),
        expect.objectContaining({
          name: "tool_latency_ms",
          count: 1,
        }),
      ]),
    );
  });

  it("rejects /metrics without the configured API key", async () => {
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

    const response = await fetch(`${getServerBaseUrl(server)}/metrics`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('ApiKey realm="confluence-mcp-metrics"');
    expect(body).toEqual({
      error: "Unauthorized.",
    });
  });

  it("returns 404 when metrics are disabled", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        app: {
          ...baseContext.config.app,
          metricsEnabled: false,
        },
      },
    });

    const server = await startTestServer(context);
    servers.push(server);

    const response = await fetch(`${getServerBaseUrl(server)}/metrics`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Metrics are disabled.",
    });
  });
});
