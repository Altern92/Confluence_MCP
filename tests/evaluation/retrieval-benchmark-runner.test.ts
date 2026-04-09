import { describe, expect, it, vi } from "vitest";

import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";
import { RetrievalBenchmarkRunner } from "../../src/evaluation/retrieval-benchmark-runner.js";

describe("RetrievalBenchmarkRunner", () => {
  it("evaluates keyword and hybrid runs and builds summary deltas", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
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
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            snippet: "deployment checklist",
            score: 0.9,
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
      })
      .mockResolvedValueOnce({
        retrievalModeUsed: "hybrid" as const,
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
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            snippet: "deployment checklist",
            score: 0.04,
            retrievalSource: "hybrid_rrf" as const,
            sectionPath: ["Release Notes"],
            lastModified: "2026-04-09T08:00:00Z",
            retrievedAt: "2026-04-09T09:00:02Z",
            verificationStatus: "verified_service_v2_fetch" as const,
            rankingDebug: {
              keywordRank: 1,
              semanticRank: 1,
              rrfScore: 0.04,
              similarity: 0.88,
            },
            provenance: {
              source: "hybrid_rrf" as const,
              cql: 'type = page AND space = "ENG"',
              keywordRank: 1,
              semanticRank: 1,
              rrfScore: 0.04,
            },
          },
        ],
        nextCursor: null,
        debug: null,
      });

    const indexStore = new InMemoryDocumentIndexStore();
    indexStore.upsertPageDocument({
      document: {
        contentType: "page",
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: [],
        body: "<p>deployment checklist and release notes</p>",
        bodyFormat: "storage",
        lastModified: "2026-04-09T08:00:00Z",
        version: {
          number: 1,
          createdAt: "2026-04-09T08:00:00Z",
        },
        tenantId: null,
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      },
      chunks: [
        {
          chunkId: "chunk-1",
          documentId: "page:123",
          chunkIndex: 0,
          content: "deployment checklist and release notes",
          charCount: 38,
          metadata: {
            contentType: "page",
            pageId: "123",
            pageTitle: "Release Notes",
            spaceKey: "ENG",
            ancestorIds: [],
            sectionPath: ["Release Notes"],
            lastModified: "2026-04-09T08:00:00Z",
            version: {
              number: 1,
              createdAt: "2026-04-09T08:00:00Z",
            },
            tenantId: null,
            url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
            bodyFormat: "storage",
          },
        },
      ],
    });

    const runner = new RetrievalBenchmarkRunner(
      {
        search,
      },
      indexStore,
    );

    const report = await runner.runSuite({
      suiteId: "sample-suite",
      cases: [
        {
          id: "case-1",
          query: "deployment checklist",
          scope: {
            type: "space",
            spaceKey: "ENG",
          },
          expectedPageIds: ["123"],
          topK: 5,
          modes: ["keyword", "hybrid"],
        },
      ],
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(report.cases).toHaveLength(2);
    expect(report.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestedMode: "keyword",
          avgRecallAtK: 1,
          avgMrr: 1,
          avgCitationCorrectnessRate: 1,
        }),
        expect.objectContaining({
          requestedMode: "hybrid",
          avgRecallAtK: 1,
          avgMrr: 1,
          avgCitationCorrectnessRate: 1,
        }),
      ]),
    );
    expect(report.keywordVsHybrid).toEqual({
      casesCompared: 1,
      hybridBetterRecallCases: 0,
      hybridBetterMrrCases: 0,
      avgRecallDelta: 0,
      avgMrrDelta: 0,
    });
  });
});
