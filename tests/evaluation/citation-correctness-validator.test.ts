import { describe, expect, it } from "vitest";

import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";
import { CitationCorrectnessValidator } from "../../src/evaluation/citation-correctness-validator.js";

function createIndexedStore() {
  const store = new InMemoryDocumentIndexStore();

  store.upsertPageDocument({
    document: {
      contentType: "page",
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      ancestorIds: [],
      body: "<p>Deployment release checklist and approval notes.</p>",
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
        content: "deployment release checklist",
        charCount: 28,
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

  return store;
}

describe("CitationCorrectnessValidator", () => {
  it("marks snippets found in indexed page content as correct", () => {
    const validator = new CitationCorrectnessValidator(createIndexedStore());

    const result = validator.validateSearchResult({
      rank: 1,
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      snippet: "deployment release checklist",
      score: 0.9,
      retrievalSource: "vector_semantic",
      sectionPath: ["Release Notes"],
      lastModified: "2026-04-09T08:00:00Z",
      retrievedAt: "2026-04-09T09:00:00Z",
      verificationStatus: "verified_service_v2_fetch",
      rankingDebug: {
        keywordRank: null,
        semanticRank: 1,
        rrfScore: null,
        similarity: 0.9,
      },
      provenance: {
        source: "vector_semantic",
        chunkId: "chunk-1",
        documentId: "page:123",
        similarity: 0.9,
      },
    });

    expect(result).toEqual({
      pageId: "123",
      snippet: "deployment release checklist",
      status: "correct",
      evidenceSource: "document_body",
      matchedChunkId: null,
    });
  });

  it("marks title fallback snippets as unknown", () => {
    const validator = new CitationCorrectnessValidator(createIndexedStore());

    const result = validator.validateSearchResult({
      rank: 1,
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      snippet: "Release Notes",
      score: 0.5,
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
    });

    expect(result.status).toBe("unknown");
    expect(result.evidenceSource).toBe("title_fallback");
  });

  it("marks missing indexed documents as unknown", () => {
    const validator = new CitationCorrectnessValidator(new InMemoryDocumentIndexStore());

    const result = validator.validateSearchResult({
      rank: 1,
      pageId: "999",
      title: "Missing Page",
      spaceKey: "ENG",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=999",
      snippet: "some snippet",
      score: 0.2,
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
    });

    expect(result.status).toBe("unknown");
    expect(result.evidenceSource).toBe("missing_document");
  });
});
