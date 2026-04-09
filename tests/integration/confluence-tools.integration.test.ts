import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server as HttpServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeServer, createTestContext, getServerBaseUrl, startTestServer } from "./helpers.js";

describe("integration: additional Confluence tools", () => {
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

  it("executes confluence.get_page through the MCP HTTP endpoint", async () => {
    const getPage = vi.fn(async () => ({
      pageId: "123",
      title: "Release Notes",
      status: "current",
      spaceId: "42",
      url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
      bodyFormat: "storage" as const,
      body: "<p>Release notes content</p>",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
    }));

    const context = createTestContext({
      contentService: {
        search: vi.fn(),
        getPage,
        getPageTree: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      },
    });

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

    expect(getPage).toHaveBeenCalledWith({
      pageId: "123",
      bodyFormat: "storage",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      pageId: "123",
      title: "Release Notes",
      status: "current",
      spaceId: "42",
      url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
      bodyFormat: "storage",
      body: "<p>Release notes content</p>",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
    });
  });

  it("executes confluence.get_page_tree through the MCP HTTP endpoint", async () => {
    const getPageTree = vi.fn(async () => ({
      rootPageId: "123",
      descendants: [
        {
          pageId: "124",
          title: "Child Page",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/124/Child+Page",
          snippet: "Child page content",
        },
      ],
      nextCursor: "next-123",
    }));

    const context = createTestContext({
      contentService: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageTree,
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      },
    });

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.get_page_tree",
      arguments: {
        rootPageId: "123",
        limit: 25,
      },
    });

    expect(getPageTree).toHaveBeenCalledWith({
      rootPageId: "123",
      limit: 25,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      rootPageId: "123",
      descendants: [
        {
          pageId: "124",
          title: "Child Page",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/124/Child+Page",
          snippet: "Child page content",
        },
      ],
      nextCursor: "next-123",
    });
  });

  it("executes confluence.get_page_ancestors through the MCP HTTP endpoint", async () => {
    const getPageAncestors = vi.fn(async () => ({
      pageId: "123",
      ancestors: [
        {
          pageId: "100",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/wiki/spaces/ENG/overview",
          depth: 1,
        },
        {
          pageId: "110",
          title: "Release Planning",
          spaceId: "42",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/110/Release+Planning",
          depth: 2,
        },
      ],
      nextCursor: null,
    }));

    const context = createTestContext({
      contentService: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageTree: vi.fn(),
        getPageAncestors,
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      },
    });

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.get_page_ancestors",
      arguments: {
        pageId: "123",
      },
    });

    expect(getPageAncestors).toHaveBeenCalledWith({
      pageId: "123",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      pageId: "123",
      ancestors: [
        {
          pageId: "100",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/wiki/spaces/ENG/overview",
          depth: 1,
        },
        {
          pageId: "110",
          title: "Release Planning",
          spaceId: "42",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/110/Release+Planning",
          depth: 2,
        },
      ],
      nextCursor: null,
    });
  });

  it("executes confluence.get_page_restrictions through the MCP HTTP endpoint", async () => {
    const getPageRestrictions = vi.fn(async () => ({
      pageId: "123",
      operations: [
        {
          operation: "read",
          subjects: [
            {
              type: "user" as const,
              identifier: "abc-123",
              displayName: "Ada Lovelace",
            },
            {
              type: "group" as const,
              identifier: "eng-managers",
              displayName: "Engineering Managers",
            },
          ],
        },
      ],
    }));

    const context = createTestContext({
      contentService: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageTree: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions,
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      },
    });

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.get_page_restrictions",
      arguments: {
        pageId: "123",
      },
    });

    expect(getPageRestrictions).toHaveBeenCalledWith({
      pageId: "123",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      pageId: "123",
      operations: [
        {
          operation: "read",
          subjects: [
            {
              type: "user",
              identifier: "abc-123",
              displayName: "Ada Lovelace",
            },
            {
              type: "group",
              identifier: "eng-managers",
              displayName: "Engineering Managers",
            },
          ],
        },
      ],
    });
  });

  it("executes confluence.get_page_descendants through the MCP HTTP endpoint", async () => {
    const getPageDescendants = vi.fn(async () => ({
      pageId: "123",
      descendants: [
        {
          pageId: "124",
          title: "Child Page",
          contentType: "page",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 57,
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124",
        },
        {
          pageId: "125",
          title: "Engineering Folder",
          contentType: "folder",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 58,
          url: null,
        },
      ],
      nextCursor: "next-descendants",
    }));

    const context = createTestContext({
      contentService: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageTree: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants,
        getPageAttachments: vi.fn(),
      },
    });

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.get_page_descendants",
      arguments: {
        pageId: "123",
        limit: 25,
        depth: 2,
      },
    });

    expect(getPageDescendants).toHaveBeenCalledWith({
      pageId: "123",
      limit: 25,
      depth: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      pageId: "123",
      descendants: [
        {
          pageId: "124",
          title: "Child Page",
          contentType: "page",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 57,
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124",
        },
        {
          pageId: "125",
          title: "Engineering Folder",
          contentType: "folder",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 58,
          url: null,
        },
      ],
      nextCursor: "next-descendants",
    });
  });

  it("executes confluence.get_page_attachments through the MCP HTTP endpoint", async () => {
    const getPageAttachments = vi.fn(async () => ({
      pageId: "123",
      attachments: [
        {
          attachmentId: "900",
          title: "release-notes.pdf",
          status: "current",
          mediaType: "application/pdf",
          mediaTypeDescription: "PDF document",
          comment: "Latest release notes",
          fileId: "file-900",
          fileSize: 2048,
          createdAt: "2026-04-08T10:00:00Z",
          pageId: "123",
          downloadUrl:
            "https://example.atlassian.net/wiki/download/attachments/123/release-notes.pdf",
          webuiUrl: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
          version: {
            number: 3,
            createdAt: "2026-04-08T10:00:00Z",
            message: "Updated attachment",
            minorEdit: false,
            authorId: "abc-123",
          },
        },
      ],
      nextCursor: null,
    }));

    const context = createTestContext({
      contentService: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageTree: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments,
      },
    });

    const server = await startTestServer(context);
    const transport = new StreamableHTTPClientTransport(new URL(`${getServerBaseUrl(server)}/mcp`));
    const client = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });

    resources.push({ client, transport, server });

    await client.connect(transport);

    const result = await client.callTool({
      name: "confluence.get_page_attachments",
      arguments: {
        pageId: "123",
        limit: 25,
        filename: "release-notes.pdf",
      },
    });

    expect(getPageAttachments).toHaveBeenCalledWith({
      pageId: "123",
      limit: 25,
      filename: "release-notes.pdf",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      pageId: "123",
      attachments: [
        {
          attachmentId: "900",
          title: "release-notes.pdf",
          status: "current",
          mediaType: "application/pdf",
          mediaTypeDescription: "PDF document",
          comment: "Latest release notes",
          fileId: "file-900",
          fileSize: 2048,
          createdAt: "2026-04-08T10:00:00Z",
          pageId: "123",
          downloadUrl:
            "https://example.atlassian.net/wiki/download/attachments/123/release-notes.pdf",
          webuiUrl: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
          version: {
            number: 3,
            createdAt: "2026-04-08T10:00:00Z",
            message: "Updated attachment",
            minorEdit: false,
            authorId: "abc-123",
          },
        },
      ],
      nextCursor: null,
    });
  });
});
