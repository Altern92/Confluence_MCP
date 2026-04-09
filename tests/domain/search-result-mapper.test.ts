import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../src/config.js";
import {
  buildHybridSearchResults,
  mapSemanticSearchResultToResult,
  mapSearchHitToResult,
  mapSearchHitsToPageTreeResults,
} from "../../src/domain/search-result-mapper.js";

const config: AppConfig = {
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
  logLevel: "info",
};

describe("search-result-mapper", () => {
  it("maps a search hit to structured output with snippet and provenance", () => {
    expect(
      mapSearchHitToResult(
        {
          id: "123",
          title: "Release Notes",
          excerpt: "<p>New&nbsp;release</p>",
          score: 0.95,
          space: {
            key: "ENG",
          },
          _links: {
            webui: "/wiki/spaces/ENG/pages/123/Release+Notes",
          },
        },
        0,
        "release notes",
        'type = page AND space = "ENG"',
        config,
      ),
    ).toEqual({
      rank: 1,
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
      snippet: "New release",
      score: 0.95,
      retrievalSource: "confluence_keyword",
      sectionPath: [],
      lastModified: null,
      retrievedAt: expect.any(String),
      verificationStatus: "not_required",
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
  });

  it("derives spaceKey from resultGlobalContainer when space metadata is missing", () => {
    expect(
      mapSearchHitToResult(
        {
          id: "123",
          title: "Release Notes",
          excerpt: "<p>New&nbsp;release</p>",
          url: "/spaces/ENG/pages/123/Release+Notes",
          resultGlobalContainer: {
            displayUrl: "/spaces/ENG",
          },
        },
        0,
        "release notes",
        'type = page AND space = "ENG"',
        config,
      ),
    ).toEqual({
      rank: 1,
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      url: "https://example.atlassian.net/spaces/ENG/pages/123/Release+Notes",
      snippet: "New release",
      score: null,
      retrievalSource: "confluence_keyword",
      sectionPath: [],
      lastModified: null,
      retrievedAt: expect.any(String),
      verificationStatus: "not_required",
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
  });

  it("returns null for a hit without any page id", () => {
    expect(
      mapSearchHitToResult(
        {
          title: "No ID",
        },
        0,
        "type page",
        "type = page",
        config,
      ),
    ).toBeNull();
  });

  it("maps search hits into page tree descendants", () => {
    expect(
      mapSearchHitsToPageTreeResults(
        [
          {
            id: "123",
            title: "Release Notes",
            excerpt: "<p>Latest release notes</p>",
            space: {
              key: "ENG",
            },
            _links: {
              webui: "/spaces/ENG/pages/123/Release+Notes",
            },
          },
        ],
        "type = page AND ancestor = 123",
        config,
      ),
    ).toEqual([
      {
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        url: "https://example.atlassian.net/spaces/ENG/pages/123/Release+Notes",
        snippet: "Latest release notes",
      },
    ]);
  });

  it("maps semantic search results into structured output", () => {
    expect(
      mapSemanticSearchResultToResult({
        rank: 1,
        score: 0.82,
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
      }),
    ).toEqual({
      rank: 1,
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      snippet: "deployment checklist",
      score: 0.82,
      retrievalSource: "vector_semantic",
      sectionPath: ["Release Notes"],
      lastModified: "2026-04-09T08:00:00Z",
      retrievedAt: "2026-04-09T08:10:00Z",
      verificationStatus: "not_required",
      rankingDebug: {
        keywordRank: null,
        semanticRank: 1,
        rrfScore: null,
        similarity: 0.82,
      },
      provenance: {
        source: "vector_semantic",
        chunkId: "chunk-1",
        documentId: "page:123",
        similarity: 0.82,
      },
    });
  });

  it("builds hybrid RRF results from keyword and semantic matches", () => {
    const results = buildHybridSearchResults({
      cql: 'type = page AND space = "ENG"',
      keywordResults: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          snippet: "keyword snippet",
          score: 0.9,
          retrievalSource: "confluence_keyword",
          sectionPath: [],
          lastModified: null,
          retrievedAt: "2026-04-09T08:10:00Z",
          verificationStatus: "not_required",
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
      semanticResults: [
        {
          rank: 1,
          pageId: "123",
          title: "Release Notes",
          spaceKey: "ENG",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          snippet: "semantic snippet",
          score: 0.8,
          retrievalSource: "vector_semantic",
          sectionPath: ["Release Notes"],
          lastModified: "2026-04-09T08:00:00Z",
          retrievedAt: "2026-04-09T08:11:00Z",
          verificationStatus: "not_required",
          rankingDebug: {
            keywordRank: null,
            semanticRank: 1,
            rrfScore: null,
            similarity: 0.8,
          },
          provenance: {
            source: "vector_semantic",
            chunkId: "chunk-1",
            documentId: "page:123",
            similarity: 0.8,
          },
        },
      ],
      topK: 5,
    });

    expect(results).toEqual([
      {
        rank: 1,
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        snippet: "keyword snippet",
        score: 2 / 61,
        retrievalSource: "hybrid_rrf",
        sectionPath: ["Release Notes"],
        lastModified: "2026-04-09T08:00:00Z",
        retrievedAt: expect.any(String),
        verificationStatus: "not_required",
        rankingDebug: {
          keywordRank: 1,
          semanticRank: 1,
          rrfScore: 2 / 61,
          similarity: 0.8,
        },
        provenance: {
          source: "hybrid_rrf",
          cql: 'type = page AND space = "ENG"',
          keywordRank: 1,
          semanticRank: 1,
          rrfScore: 2 / 61,
        },
      },
    ]);
  });
});
