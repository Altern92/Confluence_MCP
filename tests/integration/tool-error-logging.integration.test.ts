import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server as HttpServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppContext } from "../../src/app/context.js";
import { ConfluenceForbiddenError } from "../../src/confluence/errors.js";
import type { ConfluenceClient } from "../../src/confluence/client.js";
import type { ConfluenceContentServicePort } from "../../src/domain/confluence-content-service.js";
import { MetricsRegistry } from "../../src/observability/metrics-registry.js";
import { closeServer, createTestConfig, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: tool error logging", () => {
  const resources: Array<{
    client: Client;
    transport: StreamableHTTPClientTransport;
    server: HttpServer;
  }> = [];

  afterEach(async () => {
    while (resources.length > 0) {
      const resource = resources.pop();
      if (!resource) {
        continue;
      }

      await resource.client.close();
      await resource.transport.close();
      await closeServer(resource.server);
    }
  });

  it("returns structured tool errors and logs errorClass metadata", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const context: AppContext = {
      config: createTestConfig(),
      logger,
      metrics: new MetricsRegistry(),
      confluenceClient: {} as ConfluenceClient,
      contentService: {
        search: vi.fn(async () => {
          throw new ConfluenceForbiddenError("Forbidden", {
            method: "GET",
            url: "https://example.atlassian.net/wiki/rest/api/search",
            status: 403,
          });
        }),
        getPage: vi.fn(),
        getPageTree: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      } satisfies ConfluenceContentServicePort,
    };

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.search",
      arguments: {
        query: "release notes",
        scope: {
          type: "space",
          spaceKey: "ENG",
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      errorClass: "confluence_forbidden",
      retryable: false,
      status: 403,
    });
    expect(logger.error).toHaveBeenCalledWith(
      "confluence.search failed",
      expect.objectContaining({
        toolName: "confluence.search",
        scopeType: "space",
        durationMs: expect.any(Number),
        retrievalModeRequested: "keyword",
        errorClass: "confluence_forbidden",
        confluenceStatus: 403,
      }),
    );
  });

  it("returns output_validation when a tool produces a schema-invalid payload", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const context: AppContext = {
      config: createTestConfig(),
      logger,
      metrics: new MetricsRegistry(),
      confluenceClient: {} as ConfluenceClient,
      contentService: {
        search: vi.fn(async () => ({
          retrievalModeUsed: "keyword",
          policyApplied: {
            policyId: "default-secure-rag",
            verificationRequired: true,
            verificationMode: "service_v2_fetch",
            maxTopK: 20,
            maxSnippetChars: 600,
            maxVerifications: 12,
            citationFirst: true,
          },
          results: [],
          nextCursor: null,
          debug: null,
        })),
        getPage: vi.fn(async () => ({
          pageId: "123",
          title: "Broken Page",
          status: "current",
          spaceId: "42",
          url: "not-a-url",
          bodyFormat: "storage",
          body: "<p>Broken</p>",
          version: {
            number: 1,
            createdAt: "2026-04-08T10:00:00Z",
          },
        })),
        getPageTree: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      } satisfies ConfluenceContentServicePort,
    };

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.get_page",
      arguments: {
        pageId: "123",
        bodyFormat: "storage",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      errorClass: "output_validation",
      retryable: false,
      issues: [
        {
          path: "url",
          message: "Invalid URL",
        },
      ],
    });
    expect(logger.error).toHaveBeenCalledWith(
      "confluence.get_page failed",
      expect.objectContaining({
        toolName: "confluence.get_page",
        scopeType: "page",
        durationMs: expect.any(Number),
        errorClass: "output_validation",
        confluenceStatus: null,
      }),
    );
  });
});
