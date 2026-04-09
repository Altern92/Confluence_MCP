import { describe, expect, it, vi } from "vitest";

import { ConfluencePageLoader } from "../../src/indexing/confluence-page-loader.js";

describe("ConfluencePageLoader", () => {
  it("loads a page and its ancestors for indexing", async () => {
    const getPage = vi.fn(async () => ({
      pageId: "123",
      title: "Release Notes",
      status: "current",
      spaceId: "42",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      bodyFormat: "storage" as const,
      body: "<p>Hello</p>",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
    }));
    const getPageAncestors = vi.fn(async () => ({
      pageId: "123",
      ancestors: [
        {
          pageId: "10",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/overview",
          depth: 1,
        },
      ],
      nextCursor: null,
    }));
    const loader = new ConfluencePageLoader({
      getPage,
      getPageAncestors,
    });

    const result = await loader.loadPageForSync({
      pageId: "123",
      spaceKey: "ENG",
      tenantId: "tenant-a",
    });

    expect(getPage).toHaveBeenCalledWith({
      pageId: "123",
      bodyFormat: "storage",
    });
    expect(getPageAncestors).toHaveBeenCalledWith({
      pageId: "123",
    });
    expect(result).toEqual({
      page: {
        pageId: "123",
        title: "Release Notes",
        status: "current",
        spaceId: "42",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage",
        body: "<p>Hello</p>",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
      },
      ancestors: [
        {
          pageId: "10",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/overview",
          depth: 1,
        },
      ],
      spaceKey: "ENG",
      lastModified: "2026-04-08T10:00:00Z",
      tenantId: "tenant-a",
    });
  });

  it("allows overriding body format and defaults optional values to null", async () => {
    const loader = new ConfluencePageLoader({
      getPage: vi.fn(async () => ({
        pageId: "123",
        title: "Release Notes",
        status: null,
        spaceId: null,
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "atlas_doc_format" as const,
        body: "{}",
        version: {
          number: null,
          createdAt: null,
        },
      })),
      getPageAncestors: vi.fn(async () => ({
        pageId: "123",
        ancestors: [],
        nextCursor: null,
      })),
    });

    const result = await loader.loadPageForSync({
      pageId: "123",
      bodyFormat: "atlas_doc_format",
    });

    expect(result.spaceKey).toBeNull();
    expect(result.lastModified).toBeNull();
    expect(result.tenantId).toBeNull();
  });
});
