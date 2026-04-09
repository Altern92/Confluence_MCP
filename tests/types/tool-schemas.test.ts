import { describe, expect, it } from "vitest";

import {
  getPageAttachmentsInputSchema,
  getPageAttachmentsOutputSchema,
  getPageAncestorsInputSchema,
  getPageAncestorsOutputSchema,
  getPageDescendantsInputSchema,
  getPageDescendantsOutputSchema,
  getPageInputSchema,
  getPageOutputSchema,
  getPageRestrictionsInputSchema,
  getPageRestrictionsOutputSchema,
  getPageTreeInputSchema,
  getPageTreeOutputSchema,
  searchInputSchema,
  searchOutputSchema,
} from "../../src/types/tool-schemas.js";

describe("tool schemas", () => {
  it("accepts a valid search input and applies retrieval defaults", () => {
    expect(
      searchInputSchema.parse({
        query: "release notes",
        scope: {
          type: "page_tree",
          pageId: "123",
        },
        filters: {
          updatedAfter: "2026-04-08",
        },
      }),
    ).toEqual({
      query: "release notes",
      scope: {
        type: "page_tree",
        pageId: "123",
      },
      filters: {
        contentType: "page",
        updatedAfter: "2026-04-08",
      },
    });
  });

  it("accepts optional rag policy and debug flags in search input", () => {
    expect(
      searchInputSchema.parse({
        query: "release notes",
        scope: {
          type: "space",
          spaceKey: "ENG",
        },
        ragPolicyId: "default-secure-rag",
        debug: true,
      }),
    ).toEqual({
      query: "release notes",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
      ragPolicyId: "default-secure-rag",
      debug: true,
    });
  });

  it("rejects non-numeric page ids in search scope", () => {
    expect(() =>
      searchInputSchema.parse({
        query: "release notes",
        scope: {
          type: "page",
          pageId: "abc",
        },
      }),
    ).toThrow("pageId must be a numeric Confluence page ID.");
  });

  it("rejects invalid updatedAfter values", () => {
    expect(() =>
      searchInputSchema.parse({
        query: "release notes",
        scope: {
          type: "space",
          spaceKey: "ENG",
        },
        filters: {
          updatedAfter: "not-a-date",
        },
      }),
    ).toThrow("updatedAfter must be an ISO-8601 datetime or YYYY-MM-DD date.");
  });

  it("rejects pageId with whitespace in get_page", () => {
    expect(() =>
      getPageInputSchema.parse({
        pageId: "12 3",
      }),
    ).toThrow("pageId must be a numeric Confluence page ID.");
  });

  it("rejects non-numeric rootPageId in get_page_tree", () => {
    expect(() =>
      getPageTreeInputSchema.parse({
        rootPageId: "root-123",
      }),
    ).toThrow("rootPageId must be a numeric Confluence page ID.");
  });

  it("rejects non-numeric pageId in get_page_ancestors", () => {
    expect(() =>
      getPageAncestorsInputSchema.parse({
        pageId: "anc-123",
      }),
    ).toThrow("pageId must be a numeric Confluence page ID.");
  });

  it("rejects non-numeric pageId in get_page_restrictions", () => {
    expect(() =>
      getPageRestrictionsInputSchema.parse({
        pageId: "abc 123",
      }),
    ).toThrow("pageId must be a numeric Confluence page ID.");
  });

  it("rejects invalid depth in get_page_descendants", () => {
    expect(() =>
      getPageDescendantsInputSchema.parse({
        pageId: "123",
        depth: 0,
      }),
    ).toThrow();
  });

  it("rejects blank filename in get_page_attachments", () => {
    expect(() =>
      getPageAttachmentsInputSchema.parse({
        pageId: "123",
        filename: "   ",
      }),
    ).toThrow();
  });

  it("accepts a valid confluence.search output payload", () => {
    expect(
      searchOutputSchema.parse({
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
      }),
    ).toMatchObject({
      retrievalModeUsed: "keyword",
      policyApplied: {
        policyId: "default-secure-rag",
      },
      results: [
        {
          pageId: "123",
        },
      ],
      nextCursor: null,
    });
  });

  it("accepts semantic and hybrid provenance plus ranking debug payloads", () => {
    expect(
      searchOutputSchema.parse({
        retrievalModeUsed: "hybrid",
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
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            snippet: "deployment checklist",
            score: 0.91,
            retrievalSource: "vector_semantic",
            sectionPath: ["Release Notes", "Checklist"],
            lastModified: "2026-04-09T08:00:00Z",
            retrievedAt: "2026-04-09T09:00:00Z",
            verificationStatus: "verified_service_v2_fetch",
            rankingDebug: {
              keywordRank: null,
              semanticRank: 1,
              rrfScore: null,
              similarity: 0.91,
            },
            provenance: {
              source: "vector_semantic",
              chunkId: "chunk-1",
              documentId: "page:123",
              similarity: 0.91,
            },
          },
          {
            rank: 2,
            pageId: "456",
            title: "Deployment Guide",
            spaceKey: "ENG",
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=456",
            snippet: "release flow",
            score: 0.04,
            retrievalSource: "hybrid_rrf",
            sectionPath: ["Deployment Guide"],
            lastModified: null,
            retrievedAt: "2026-04-09T09:00:00Z",
            verificationStatus: "verified_service_v2_fetch",
            rankingDebug: {
              keywordRank: 2,
              semanticRank: 3,
              rrfScore: 0.04,
              similarity: 0.62,
            },
            provenance: {
              source: "hybrid_rrf",
              cql: 'type = page AND space = "ENG"',
              keywordRank: 2,
              semanticRank: 3,
              rrfScore: 0.04,
            },
          },
        ],
        nextCursor: null,
        debug: {
          cqlUsed: 'type = page AND space = "ENG"',
          topKRequested: 10,
          topKApplied: 10,
          verifiedCandidates: 2,
          droppedCandidates: 0,
          dropReasons: {
            forbidden: 0,
            notFound: 0,
            error: 0,
          },
          verificationMode: "service_v2_fetch",
        },
      }),
    ).toMatchObject({
      retrievalModeUsed: "hybrid",
      debug: {
        topKApplied: 10,
      },
      results: [
        {
          retrievalSource: "vector_semantic",
        },
        {
          retrievalSource: "hybrid_rrf",
        },
      ],
    });
  });

  it("accepts a valid confluence.get_page output payload", () => {
    expect(
      getPageOutputSchema.parse({
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
      }),
    ).toMatchObject({
      pageId: "123",
      bodyFormat: "storage",
    });
  });

  it("accepts a valid confluence.get_page_tree output payload", () => {
    expect(
      getPageTreeOutputSchema.parse({
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
      }),
    ).toMatchObject({
      rootPageId: "123",
      nextCursor: "next-123",
    });
  });

  it("accepts a valid confluence.get_page_ancestors output payload", () => {
    expect(
      getPageAncestorsOutputSchema.parse({
        pageId: "123",
        ancestors: [
          {
            pageId: "100",
            title: "Engineering",
            spaceId: "42",
            url: "https://example.atlassian.net/wiki/spaces/ENG/overview",
            depth: 1,
          },
        ],
        nextCursor: null,
      }),
    ).toMatchObject({
      pageId: "123",
      ancestors: [
        {
          pageId: "100",
        },
      ],
      nextCursor: null,
    });
  });

  it("accepts a valid confluence.get_page_restrictions output payload", () => {
    expect(
      getPageRestrictionsOutputSchema.parse({
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
            ],
          },
        ],
      }),
    ).toMatchObject({
      pageId: "123",
      operations: [
        {
          operation: "read",
        },
      ],
    });
  });

  it("accepts a valid confluence.get_page_descendants output payload", () => {
    expect(
      getPageDescendantsOutputSchema.parse({
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
        ],
        nextCursor: null,
      }),
    ).toMatchObject({
      pageId: "123",
      descendants: [
        {
          pageId: "124",
        },
      ],
      nextCursor: null,
    });
  });

  it("accepts a valid confluence.get_page_attachments output payload", () => {
    expect(
      getPageAttachmentsOutputSchema.parse({
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
      }),
    ).toMatchObject({
      pageId: "123",
      attachments: [
        {
          attachmentId: "900",
        },
      ],
      nextCursor: "next-attachments",
    });
  });
});
