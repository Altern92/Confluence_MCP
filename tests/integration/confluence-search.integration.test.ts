import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server as HttpServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppContext } from "../../src/app/context.js";
import type { ConfluenceClient } from "../../src/confluence/client.js";
import type { ConfluenceContentServicePort } from "../../src/domain/confluence-content-service.js";
import { MetricsRegistry } from "../../src/observability/metrics-registry.js";
import { closeServer, createTestConfig, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: confluence.search", () => {
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

  it("lists tools and executes confluence.search through the MCP HTTP endpoint", async () => {
    const search = vi.fn(async () => ({
      retrievalModeUsed: "keyword" as const,
      policyApplied: {
        policyId: "default-secure-rag" as const,
        verificationRequired: true,
        verificationMode: "service_v2_fetch" as const,
        maxTopK: 20,
        maxSnippetChars: 600,
        maxVerifications: 12,
        citationFirst: true,
      },
      results: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
          snippet: "Release notes content",
          score: 0.98,
          retrievalSource: "confluence_keyword" as const,
          sectionPath: [],
          lastModified: null,
          retrievedAt: "2026-04-09T09:00:00Z",
          verificationStatus: "verified_service_v2_fetch" as const,
          rankingDebug: {
            keywordRank: 1,
            semanticRank: null,
            rrfScore: null,
            similarity: null,
          },
          provenance: {
            source: "confluence_keyword" as const,
            cql: 'type = page AND space = "ENG"',
          },
        },
      ],
      nextCursor: null,
      debug: null,
    }));

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
        search,
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

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("confluence.search");

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

    expect(search).toHaveBeenCalledWith({
      query: "release notes",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
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
      results: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
          snippet: "Release notes content",
          score: 0.98,
          retrievalSource: "confluence_keyword",
          sectionPath: [],
          lastModified: null,
          retrievedAt: "2026-04-09T09:00:00Z",
          verificationStatus: "verified_service_v2_fetch",
          rankingDebug: {
            keywordRank: 1,
            semanticRank: null,
            rrfScore: null,
            similarity: null,
          },
          provenance: {
            source: "confluence_keyword",
            cql: 'type = page AND space = "ENG"',
          },
        },
      ],
      nextCursor: null,
      debug: null,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "confluence.search completed",
      expect.objectContaining({
        toolName: "confluence.search",
        scopeType: "space",
        durationMs: expect.any(Number),
        retrievalModeRequested: "keyword",
        retrievalModeUsed: "keyword",
        resultCount: 1,
        hasNextCursor: false,
      }),
    );
  });
});
