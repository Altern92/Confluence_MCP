import { describe, expect, it, vi } from "vitest";

import {
  ConfluenceForbiddenError,
  ConfluenceValidationError,
} from "../../src/confluence/errors.js";
import {
  applySearchRagPolicy,
  computeAppliedSearchTopK,
  computeSearchCandidateTopK,
  DEFAULT_SECURE_RAG_POLICY,
} from "../../src/retrieval/rag-policy.js";

describe("rag-policy", () => {
  it("clamps applied topK by policy verification budget", () => {
    expect(
      computeAppliedSearchTopK({
        requestedTopK: 50,
        policy: DEFAULT_SECURE_RAG_POLICY,
      }),
    ).toBe(12);
    expect(
      computeSearchCandidateTopK({
        requestedTopK: 50,
        policy: DEFAULT_SECURE_RAG_POLICY,
      }),
    ).toBe(24);
  });

  it("verifies results, truncates snippets, and exposes debug metadata", async () => {
    const longSnippet = "a".repeat(700);
    const getPage = vi
      .fn()
      .mockResolvedValueOnce({ id: "123" })
      .mockRejectedValueOnce(
        new ConfluenceForbiddenError("Forbidden", {
          method: "GET",
          url: "https://example.atlassian.net/wiki/api/v2/pages/456",
          status: 403,
        }),
      )
      .mockRejectedValueOnce(
        new ConfluenceValidationError("Not found", {
          method: "GET",
          url: "https://example.atlassian.net/wiki/api/v2/pages/789",
          status: 404,
        }),
      );

    const result = await applySearchRagPolicy({
      queryInput: {
        query: "release notes",
        scope: {
          type: "space",
          spaceKey: "ENG",
        },
        retrieval: {
          mode: "hybrid",
          topK: 15,
        },
        debug: true,
      },
      cqlUsed: 'type = page AND space = "ENG"',
      requestedTopK: 15,
      policy: DEFAULT_SECURE_RAG_POLICY,
      results: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          snippet: longSnippet,
          score: 0.9,
          retrievalSource: "hybrid_rrf",
          sectionPath: ["Release Notes"],
          lastModified: "2026-04-09T08:00:00Z",
          retrievedAt: "2026-04-09T09:00:00Z",
          verificationStatus: "not_required",
          rankingDebug: {
            keywordRank: 1,
            semanticRank: 1,
            rrfScore: 0.04,
            similarity: 0.8,
          },
          provenance: {
            source: "hybrid_rrf",
            cql: 'type = page AND space = "ENG"',
            keywordRank: 1,
            semanticRank: 1,
            rrfScore: 0.04,
          },
        },
        {
          rank: 2,
          pageId: "456",
          title: "Restricted Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=456",
          snippet: "restricted snippet",
          score: 0.4,
          retrievalSource: "hybrid_rrf",
          sectionPath: [],
          lastModified: null,
          retrievedAt: "2026-04-09T09:00:00Z",
          verificationStatus: "not_required",
          rankingDebug: {
            keywordRank: 2,
            semanticRank: null,
            rrfScore: 0.02,
            similarity: null,
          },
          provenance: {
            source: "hybrid_rrf",
            cql: 'type = page AND space = "ENG"',
            keywordRank: 2,
            semanticRank: null,
            rrfScore: 0.02,
          },
        },
        {
          rank: 3,
          pageId: "789",
          title: "Missing Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=789",
          snippet: "missing snippet",
          score: 0.3,
          retrievalSource: "hybrid_rrf",
          sectionPath: [],
          lastModified: null,
          retrievedAt: "2026-04-09T09:00:00Z",
          verificationStatus: "not_required",
          rankingDebug: {
            keywordRank: 3,
            semanticRank: null,
            rrfScore: 0.01,
            similarity: null,
          },
          provenance: {
            source: "hybrid_rrf",
            cql: 'type = page AND space = "ENG"',
            keywordRank: 3,
            semanticRank: null,
            rrfScore: 0.01,
          },
        },
      ],
      confluenceClient: {
        getPage,
      } as never,
    });

    expect(result.policyApplied).toEqual({
      policyId: "default-secure-rag",
      verificationRequired: true,
      verificationMode: "service_v2_fetch",
      maxTopK: 20,
      maxSnippetChars: 600,
      maxVerifications: 12,
      citationFirst: true,
    });
    expect(result.results).toEqual([
      expect.objectContaining({
        pageId: "123",
        verificationStatus: "verified_service_v2_fetch",
        snippet: `${"a".repeat(600)}...`,
      }),
    ]);
    expect(result.debug).toEqual({
      cqlUsed: 'type = page AND space = "ENG"',
      topKRequested: 15,
      topKApplied: 12,
      verifiedCandidates: 1,
      droppedCandidates: 2,
      dropReasons: {
        forbidden: 1,
        notFound: 1,
        error: 0,
      },
      verificationMode: "service_v2_fetch",
    });
  });
});
