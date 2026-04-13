import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config.js";
import type { ConfluenceClient } from "../../src/confluence/client.js";
import { ConfluenceContentService } from "../../src/domain/confluence-content-service.js";

const defaultPolicyApplied = {
  policyId: "default-secure-rag" as const,
  verificationRequired: true,
  verificationMode: "service_v2_fetch" as const,
  maxTopK: 20,
  maxSnippetChars: 600,
  maxVerifications: 12,
  citationFirst: true,
};

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
    },
    defaults: {
      topK: 10,
    },
    logLevel: "error",
  };
}

describe("ConfluenceContentService", () => {
  it("builds scoped search CQL, uses default topK, and maps results", async () => {
    const search = vi.fn(async () => ({
      results: [
        {
          content: {
            id: "123",
            title: "Release Notes",
            space: {
              key: "ENG",
            },
            _links: {
              webui: "/spaces/ENG/pages/123/Release+Notes",
            },
          },
          excerpt: "<p>Latest release notes</p>",
          score: 0.91,
        },
      ],
      _links: {
        next: "/wiki/rest/api/search?cursor=cursor-123",
      },
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    const result = await service.search({
      query: "release notes",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
    });

    expect(search).toHaveBeenCalledWith(
      'type = page AND space = "ENG" AND text ~ "release notes"',
      20,
    );
    expect(result).toEqual({
      retrievalModeUsed: "keyword",
      policyApplied: defaultPolicyApplied,
      results: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/spaces/ENG/pages/123/Release+Notes",
          snippet: "Latest release notes",
          score: 0.91,
          retrievalSource: "confluence_keyword",
          sectionPath: [],
          lastModified: null,
          retrievedAt: expect.any(String),
          verificationStatus: "verified_service_v2_fetch",
          rankingDebug: {
            keywordRank: 1,
            semanticRank: null,
            rrfScore: null,
            similarity: null,
          },
          provenance: {
            source: "confluence_keyword",
            cql: 'type = page AND space = "ENG" AND text ~ "release notes"',
          },
        },
      ],
      nextCursor: "cursor-123",
      debug: null,
    });
  });

  it("reports keyword as the actual retrieval mode even when another mode is requested", async () => {
    const search = vi.fn(async () => ({
      results: [],
      _links: {},
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    const result = await service.search({
      query: "release notes",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
      retrieval: {
        mode: "hybrid",
        topK: 5,
      },
    });

    expect(search).toHaveBeenCalledWith(
      'type = page AND space = "ENG" AND text ~ "release notes"',
      10,
    );
    expect(result).toEqual({
      retrievalModeUsed: "keyword",
      policyApplied: defaultPolicyApplied,
      results: [],
      nextCursor: null,
      debug: null,
    });
  });

  it("rejects search outside the configured space allowlist", async () => {
    const config = createTestConfig();
    config.policy = {
      allowedSpaceKeys: ["OPS"],
      allowedRootPageIds: [],
    };
    const search = vi.fn(async () => ({
      results: [],
      _links: {},
    }));

    const service = new ConfluenceContentService({
      config,
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    await expect(
      service.search({
        query: "release notes",
        scope: {
          type: "space",
          spaceKey: "ENG",
        },
      }),
    ).rejects.toThrow('Search is not allowed for space "ENG"');
    expect(search).not.toHaveBeenCalled();
  });

  it("uses semantic retrieval when a semantic indexer is configured", async () => {
    const search = vi.fn(async () => ({
      results: [],
      _links: {},
    }));
    const semanticSearch = vi.fn(async () => [
      {
        rank: 1,
        score: 0.88,
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        snippet: "deployment checklist",
        chunkId: "chunk-1",
        documentId: "page:123",
        sectionPath: ["Release Notes"],
        lastModified: "2026-04-09T08:00:00Z",
        retrievedAt: "2026-04-09T08:10:00Z",
      },
    ]);

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
      semanticIndexer: {
        search: semanticSearch,
      } as never,
    });

    const result = await service.search({
      query: "deployment checklist",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
      retrieval: {
        mode: "semantic",
        topK: 5,
      },
    });

    expect(search).not.toHaveBeenCalled();
    expect(semanticSearch).toHaveBeenCalled();
    expect(result).toEqual({
      retrievalModeUsed: "semantic",
      policyApplied: defaultPolicyApplied,
      results: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          snippet: "deployment checklist",
          score: 0.88,
          retrievalSource: "vector_semantic",
          sectionPath: ["Release Notes"],
          lastModified: "2026-04-09T08:00:00Z",
          retrievedAt: "2026-04-09T08:10:00Z",
          verificationStatus: "verified_service_v2_fetch",
          rankingDebug: {
            keywordRank: null,
            semanticRank: 1,
            rrfScore: null,
            similarity: 0.88,
          },
          provenance: {
            source: "vector_semantic",
            chunkId: "chunk-1",
            documentId: "page:123",
            similarity: 0.88,
          },
        },
      ],
      nextCursor: null,
      debug: null,
    });
  });

  it("fuses keyword and semantic results in hybrid mode", async () => {
    const search = vi.fn(async () => ({
      results: [
        {
          content: {
            id: "123",
            title: "Release Notes",
            space: {
              key: "ENG",
            },
            _links: {
              webui: "/spaces/ENG/pages/123/Release+Notes",
            },
          },
          excerpt: "<p>Latest release notes</p>",
          score: 0.91,
        },
      ],
      _links: {},
    }));
    const semanticSearch = vi.fn(async () => [
      {
        rank: 1,
        score: 0.88,
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        snippet: "deployment checklist",
        chunkId: "chunk-1",
        documentId: "page:123",
        sectionPath: ["Release Notes"],
        lastModified: "2026-04-09T08:00:00Z",
        retrievedAt: "2026-04-09T08:10:00Z",
      },
      {
        rank: 2,
        score: 0.5,
        pageId: "456",
        title: "Deployment Guide",
        spaceKey: "ENG",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=456",
        snippet: "deployment guide",
        chunkId: "chunk-2",
        documentId: "page:456",
        sectionPath: ["Deployment Guide"],
        lastModified: "2026-04-09T08:05:00Z",
        retrievedAt: "2026-04-09T08:10:30Z",
      },
    ]);

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
      semanticIndexer: {
        search: semanticSearch,
      } as never,
    });

    const result = await service.search({
      query: "release deployment",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
      retrieval: {
        mode: "hybrid",
        topK: 10,
      },
    });

    expect(result.retrievalModeUsed).toBe("hybrid");
    expect(result.policyApplied).toEqual(defaultPolicyApplied);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.pageId).toBe("123");
    expect(result.results[0]?.provenance.source).toBe("hybrid_rrf");
    expect(result.results[0]?.verificationStatus).toBe("verified_service_v2_fetch");
    expect(result.results[1]?.pageId).toBe("456");
    expect(result.results[1]?.verificationStatus).toBe("verified_service_v2_fetch");
    expect(result.debug).toBeNull();
  });

  it("maps getPage output with extracted body and fallback URL", async () => {
    const getPage = vi.fn(async () => ({
      id: "123",
      title: "Release Notes",
      status: "current",
      spaceId: "42",
      body: {
        storage: {
          value: "<p>Release notes body</p>",
        },
      },
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search: vi.fn(),
        getPage,
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    const result = await service.getPage({
      pageId: "123",
      bodyFormat: "storage",
    });

    expect(getPage).toHaveBeenCalledWith("123", "storage");
    expect(result).toEqual({
      pageId: "123",
      title: "Release Notes",
      status: "current",
      spaceId: "42",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      bodyFormat: "storage",
      body: "<p>Release notes body</p>",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
    });
  });

  it("builds page tree CQL and passes limit plus cursor to Confluence", async () => {
    const search = vi.fn(async () => ({
      results: [],
      _links: {
        next: "/wiki/rest/api/search?cursor=next-tree-cursor",
      },
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    const result = await service.getPageTree({
      rootPageId: "987",
      limit: 25,
      cursor: "prev-cursor",
    });

    expect(search).toHaveBeenCalledWith("type = page AND ancestor = 987", 25, "prev-cursor");
    expect(result).toEqual({
      rootPageId: "987",
      descendants: [],
      nextCursor: "next-tree-cursor",
    });
  });

  it("rejects page tree lookups outside the configured root page allowlist", async () => {
    const config = createTestConfig();
    config.policy = {
      allowedSpaceKeys: [],
      allowedRootPageIds: ["123"],
    };
    const search = vi.fn(async () => ({
      results: [],
      _links: {},
    }));

    const service = new ConfluenceContentService({
      config,
      confluenceClient: {
        search,
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    await expect(
      service.getPageTree({
        rootPageId: "987",
        limit: 25,
      }),
    ).rejects.toThrow('Page tree lookup is not allowed for page "987"');
    expect(search).not.toHaveBeenCalled();
  });

  it("maps page ancestors into normalized output with pagination info", async () => {
    const getPageAncestors = vi.fn(async () => ({
      results: [
        {
          id: "10",
          title: "Engineering",
          spaceId: "42",
          _links: {
            webui: "/spaces/ENG/overview",
          },
        },
        {
          id: "20",
          title: "Release Planning",
          spaceId: "42",
          _links: {
            webui: "/spaces/ENG/pages/20/Release+Planning",
          },
        },
      ],
      _links: {
        next: "/wiki/api/v2/pages/123/ancestors?cursor=next-ancestor-cursor",
      },
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageAncestors,
        getPageRestrictions: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    const result = await service.getPageAncestors({
      pageId: "123",
    });

    expect(getPageAncestors).toHaveBeenCalledWith("123");
    expect(result).toEqual({
      pageId: "123",
      ancestors: [
        {
          pageId: "10",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/overview",
          depth: 1,
        },
        {
          pageId: "20",
          title: "Release Planning",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/pages/20/Release+Planning",
          depth: 2,
        },
      ],
      nextCursor: "next-ancestor-cursor",
    });
  });

  it("normalizes page restrictions into operation and subject lists", async () => {
    const getPageRestrictions = vi.fn(async () => ({
      read: {
        operation: "read",
        restrictions: {
          user: {
            results: [
              {
                accountId: "abc-123",
                displayName: "Ada Lovelace",
              },
            ],
          },
          group: {
            results: [
              {
                name: "eng-managers",
                displayName: "Engineering Managers",
              },
            ],
          },
        },
      },
      update: {
        operation: "update",
        restrictions: {
          user: {
            results: [],
          },
        },
      },
      _links: {},
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions,
      } as unknown as ConfluenceClient,
    });

    const result = await service.getPageRestrictions({
      pageId: "123",
    });

    expect(getPageRestrictions).toHaveBeenCalledWith("123");
    expect(result).toEqual({
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
        {
          operation: "update",
          subjects: [],
        },
      ],
    });
  });

  it("maps v2 page descendants into normalized output with pagination info", async () => {
    const getPageDescendants = vi.fn(async () => ({
      results: [
        {
          id: "124",
          title: "Child Page",
          type: "page",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 10,
        },
        {
          id: "125",
          title: "Architecture Folder",
          type: "folder",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 11,
        },
      ],
      _links: {
        next: "/wiki/api/v2/pages/123/descendants?cursor=next-descendants",
      },
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants,
        getPageAttachments: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    const result = await service.getPageDescendants({
      pageId: "123",
      limit: 25,
      depth: 2,
      cursor: "cursor-123",
    });

    expect(getPageDescendants).toHaveBeenCalledWith("123", {
      limit: 25,
      depth: 2,
      cursor: "cursor-123",
    });
    expect(result).toEqual({
      pageId: "123",
      descendants: [
        {
          pageId: "124",
          title: "Child Page",
          contentType: "page",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 10,
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124",
        },
        {
          pageId: "125",
          title: "Architecture Folder",
          contentType: "folder",
          status: "current",
          parentId: "123",
          depth: 1,
          childPosition: 11,
          url: null,
        },
      ],
      nextCursor: "next-descendants",
    });
  });

  it("maps page attachments into normalized output with pagination info", async () => {
    const getPageAttachments = vi.fn(async () => ({
      results: [
        {
          id: "900",
          title: "release-notes.pdf",
          status: "current",
          mediaType: "application/pdf",
          mediaTypeDescription: "PDF document",
          comment: "Latest release notes",
          fileId: "file-900",
          fileSize: 2048,
          createdAt: "2026-04-08T10:00:00Z",
          pageId: "123",
          downloadLink: "/wiki/download/attachments/123/release-notes.pdf",
          webuiLink: "/wiki/spaces/ENG/pages/123/Release+Notes",
          version: {
            number: 3,
            createdAt: "2026-04-08T10:00:00Z",
            message: "Updated attachment",
            minorEdit: false,
            authorId: "abc-123",
          },
        },
      ],
      _links: {
        next: "/wiki/api/v2/pages/123/attachments?cursor=next-attachments",
      },
    }));

    const service = new ConfluenceContentService({
      config: createTestConfig(),
      confluenceClient: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments,
      } as unknown as ConfluenceClient,
    });

    const result = await service.getPageAttachments({
      pageId: "123",
      limit: 25,
      cursor: "cursor-456",
      filename: "release-notes.pdf",
      mediaType: "application/pdf",
    });

    expect(getPageAttachments).toHaveBeenCalledWith("123", {
      limit: 25,
      cursor: "cursor-456",
      filename: "release-notes.pdf",
      mediaType: "application/pdf",
    });
    expect(result).toEqual({
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
      nextCursor: "next-attachments",
    });
  });

  it("rejects page lookups outside the configured space allowlist", async () => {
    const config = createTestConfig();
    config.policy = {
      allowedSpaceKeys: ["OPS"],
      allowedRootPageIds: [],
    };
    const getPage = vi.fn(async () => ({
      id: "123",
      title: "Release Notes",
      status: "current",
      spaceId: "42",
      body: {
        storage: {
          value: "<p>Release notes body</p>",
        },
      },
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
    }));
    const getSpaceById = vi.fn(async () => ({
      id: "42",
      key: "ENG",
      name: "Engineering",
      type: "global",
      status: "current",
    }));

    const service = new ConfluenceContentService({
      config,
      confluenceClient: {
        search: vi.fn(),
        getPage,
        getPageMetadata: vi.fn(),
        getSpaceById,
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    await expect(
      service.getPage({
        pageId: "123",
        bodyFormat: "storage",
      }),
    ).rejects.toThrow('Page lookup is not allowed for space "ENG"');
    expect(getSpaceById).toHaveBeenCalledWith("42");
  });

  it("rejects page ancestors lookups outside the configured space allowlist", async () => {
    const config = createTestConfig();
    config.policy = {
      allowedSpaceKeys: ["OPS"],
      allowedRootPageIds: [],
    };
    const getPageMetadata = vi.fn(async () => ({
      id: "123",
      spaceId: "42",
    }));
    const getSpaceById = vi.fn(async () => ({
      id: "42",
      key: "ENG",
      name: "Engineering",
      type: "global",
      status: "current",
    }));
    const getPageAncestors = vi.fn(async () => ({
      results: [],
      _links: {},
    }));

    const service = new ConfluenceContentService({
      config,
      confluenceClient: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageMetadata,
        getSpaceById,
        getPageAncestors,
        getPageRestrictions: vi.fn(),
        getPageDescendants: vi.fn(),
        getPageAttachments: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    await expect(
      service.getPageAncestors({
        pageId: "123",
      }),
    ).rejects.toThrow('Page ancestors lookup is not allowed for space "ENG"');
    expect(getPageAncestors).not.toHaveBeenCalled();
  });

  it("rejects page descendants lookups outside the configured space allowlist", async () => {
    const config = createTestConfig();
    config.policy = {
      allowedSpaceKeys: ["OPS"],
      allowedRootPageIds: [],
    };
    const getPageMetadata = vi.fn(async () => ({
      id: "123",
      spaceId: "42",
    }));
    const getSpaceById = vi.fn(async () => ({
      id: "42",
      key: "ENG",
      name: "Engineering",
      type: "global",
      status: "current",
    }));
    const getPageDescendants = vi.fn(async () => ({
      results: [],
      _links: {},
    }));

    const service = new ConfluenceContentService({
      config,
      confluenceClient: {
        search: vi.fn(),
        getPage: vi.fn(),
        getPageMetadata,
        getSpaceById,
        getPageAncestors: vi.fn(),
        getPageRestrictions: vi.fn(),
        getPageDescendants,
        getPageAttachments: vi.fn(),
      } as unknown as ConfluenceClient,
    });

    await expect(
      service.getPageDescendants({
        pageId: "123",
        limit: 25,
      }),
    ).rejects.toThrow('Page descendants lookup is not allowed for space "ENG"');
    expect(getPageDescendants).not.toHaveBeenCalled();
  });
});
