import type { AppConfig } from "../config.js";
import { resolvePageUrl } from "../confluence/formatting.js";
import type { ConfluenceSearchResult } from "../confluence/types.js";
import type { GetPageTreeToolOutput, SearchToolOutput } from "../types/tool-schemas.js";
import type { SemanticSearchPageResult } from "../retrieval/types.js";
import {
  buildHybridProvenance,
  buildKeywordProvenance,
  buildSemanticProvenance,
} from "./citation-builder.js";
import { buildSearchSnippet } from "./snippet-builder.js";

function nowIsoString() {
  return new Date().toISOString();
}

function extractSpaceKeyFromDisplayUrl(displayUrl: string | undefined): string | null {
  if (!displayUrl) {
    return null;
  }

  const match = displayUrl.match(/^\/spaces\/([^/]+)$/i);
  return match?.[1] ?? null;
}

export function mapSearchHitToResult(
  hit: ConfluenceSearchResult,
  index: number,
  query: string,
  cql: string,
  config: AppConfig,
): SearchToolOutput["results"][number] | null {
  const pageId = String(hit.content?.id ?? hit.id ?? "");

  if (!pageId) {
    return null;
  }

  const title = hit.title ?? hit.content?.title ?? `Page ${pageId}`;
  const spaceKey =
    hit.space?.key ??
    hit.content?.space?.key ??
    extractSpaceKeyFromDisplayUrl(hit.resultGlobalContainer?.displayUrl) ??
    "";

  return {
    rank: index + 1,
    pageId,
    title,
    spaceKey,
    url: resolvePageUrl(config, pageId, hit.content?._links ?? hit._links, hit.url),
    snippet: buildSearchSnippet(hit.excerpt, title, query),
    score: typeof hit.score === "number" ? hit.score : null,
    retrievalSource: "confluence_keyword",
    sectionPath: [],
    lastModified: null,
    retrievedAt: nowIsoString(),
    verificationStatus: "not_required",
    rankingDebug: {
      keywordRank: index + 1,
      semanticRank: null,
      rrfScore: null,
      similarity: null,
    },
    provenance: buildKeywordProvenance(cql),
  };
}

export function mapSearchHitsToPageTreeResults(
  hits: ConfluenceSearchResult[],
  cql: string,
  config: AppConfig,
): GetPageTreeToolOutput["descendants"] {
  return hits
    .map((hit, index) => mapSearchHitToResult(hit, index, "", cql, config))
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .map(({ pageId, title, spaceKey, url, snippet }) => ({
      pageId,
      title,
      spaceKey,
      url,
      snippet,
    }));
}

export function mapSemanticSearchResultToResult(
  result: SemanticSearchPageResult,
): SearchToolOutput["results"][number] {
  return {
    rank: result.rank,
    pageId: result.pageId,
    title: result.title,
    spaceKey: result.spaceKey,
    url: result.url,
    snippet: result.snippet,
    score: result.score,
    retrievalSource: "vector_semantic",
    sectionPath: result.sectionPath,
    lastModified: result.lastModified,
    retrievedAt: result.retrievedAt,
    verificationStatus: "not_required",
    rankingDebug: {
      keywordRank: null,
      semanticRank: result.rank,
      rrfScore: null,
      similarity: result.score,
    },
    provenance: buildSemanticProvenance({
      chunkId: result.chunkId,
      documentId: result.documentId,
      similarity: result.score,
    }),
  };
}

export function buildHybridSearchResults(input: {
  cql: string;
  keywordResults: SearchToolOutput["results"];
  semanticResults: SearchToolOutput["results"];
  topK: number;
}): SearchToolOutput["results"] {
  const rrfK = 60;
  const keywordByPageId = new Map(
    input.keywordResults.map((result) => [result.pageId, result] as const),
  );
  const semanticByPageId = new Map(
    input.semanticResults.map((result) => [result.pageId, result] as const),
  );
  const candidatePageIds = new Set([...keywordByPageId.keys(), ...semanticByPageId.keys()]);

  return [...candidatePageIds]
    .map((pageId) => {
      const keywordResult = keywordByPageId.get(pageId) ?? null;
      const semanticResult = semanticByPageId.get(pageId) ?? null;
      const keywordRank = keywordResult?.rank ?? null;
      const semanticRank = semanticResult?.rank ?? null;
      const rrfScore =
        (keywordRank ? 1 / (rrfK + keywordRank) : 0) +
        (semanticRank ? 1 / (rrfK + semanticRank) : 0);
      const baseResult = keywordResult ?? semanticResult;

      if (!baseResult) {
        return null;
      }

      return {
        rank: 0,
        pageId: baseResult.pageId,
        title: baseResult.title,
        spaceKey: baseResult.spaceKey,
        url: baseResult.url,
        snippet: keywordResult?.snippet ?? semanticResult?.snippet ?? "",
        score: rrfScore,
        retrievalSource: "hybrid_rrf",
        sectionPath: semanticResult?.sectionPath ?? keywordResult?.sectionPath ?? [],
        lastModified: semanticResult?.lastModified ?? keywordResult?.lastModified ?? null,
        retrievedAt: nowIsoString(),
        verificationStatus: "not_required",
        rankingDebug: {
          keywordRank,
          semanticRank,
          rrfScore,
          similarity: semanticResult?.score ?? null,
        },
        provenance: buildHybridProvenance({
          cql: input.cql,
          keywordRank,
          semanticRank,
          rrfScore,
        }),
      } satisfies SearchToolOutput["results"][number];
    })
    .filter((result): result is NonNullable<typeof result> => result != null)
    .sort(
      (left, right) =>
        (right.score ?? 0) - (left.score ?? 0) || left.pageId.localeCompare(right.pageId),
    )
    .slice(0, input.topK)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
}
