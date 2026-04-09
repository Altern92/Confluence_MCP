import { buildSearchCql } from "../confluence/cql.js";
import { resolvePaginationInfo } from "../confluence/pagination.js";
import type { SearchToolInput, SearchToolOutput } from "../types/tool-schemas.js";
import { assertSearchScopeAllowed } from "../security/access-policy.js";
import {
  applySearchRagPolicy,
  computeSearchCandidateTopK,
  resolveSearchRagPolicy,
} from "../retrieval/rag-policy.js";
import type { ConfluenceDomainServiceOptions } from "./confluence-domain-service-options.js";
import {
  buildHybridSearchResults,
  mapSearchHitToResult,
  mapSemanticSearchResultToResult,
} from "./search-result-mapper.js";

export class ConfluenceSearchService {
  constructor(private readonly options: ConfluenceDomainServiceOptions) {}

  private async runSemanticSearch(input: SearchToolInput, topK: number) {
    const startedAt = Date.now();
    const results = await this.options.semanticIndexer!.search({
      query: input.query,
      scope: input.scope,
      topK,
      tenantId: this.options.config.indexing?.tenantId ?? null,
    });

    this.options.metrics?.recordVectorQuery({
      requestMode: (input.retrieval?.mode ?? "keyword") === "semantic" ? "semantic" : "hybrid",
      scopeType: input.scope.type,
      latencyMs: Date.now() - startedAt,
      resultCount: results.length,
    });

    return results;
  }

  async search(input: SearchToolInput): Promise<SearchToolOutput> {
    const { query, scope, filters, retrieval } = input;
    assertSearchScopeAllowed(this.options.config, scope);

    const requestedTopK = retrieval?.topK ?? this.options.config.defaults.topK;
    const ragPolicy = resolveSearchRagPolicy(input.ragPolicyId);
    const candidateTopK = computeSearchCandidateTopK({
      requestedTopK,
      policy: ragPolicy,
    });
    const cql = buildSearchCql({ query, scope, filters });
    const requestedMode = retrieval?.mode ?? "keyword";

    if (!this.options.semanticIndexer || requestedMode === "keyword") {
      const response = await this.options.confluenceClient.search(cql, candidateTopK);
      const policyResult = await applySearchRagPolicy({
        queryInput: input,
        cqlUsed: cql,
        requestedTopK,
        policy: ragPolicy,
        results: response.results
          .map((hit, index) => mapSearchHitToResult(hit, index, query, cql, this.options.config))
          .filter((result): result is NonNullable<typeof result> => result !== null),
        confluenceClient: this.options.confluenceClient,
        metrics: this.options.metrics,
      });

      return {
        retrievalModeUsed: "keyword",
        policyApplied: policyResult.policyApplied,
        results: policyResult.results,
        nextCursor: resolvePaginationInfo({ links: response._links }).nextCursor,
        debug: policyResult.debug,
      };
    }

    if (requestedMode === "semantic") {
      const semanticResults = await this.runSemanticSearch(input, candidateTopK);
      const policyResult = await applySearchRagPolicy({
        queryInput: input,
        cqlUsed: null,
        requestedTopK,
        policy: ragPolicy,
        results: semanticResults.map(mapSemanticSearchResultToResult),
        confluenceClient: this.options.confluenceClient,
        metrics: this.options.metrics,
      });

      return {
        retrievalModeUsed: "semantic",
        policyApplied: policyResult.policyApplied,
        results: policyResult.results,
        nextCursor: null,
        debug: policyResult.debug,
      };
    }

    const [keywordResponse, semanticResults] = await Promise.all([
      this.options.confluenceClient.search(cql, candidateTopK),
      this.runSemanticSearch(input, candidateTopK),
    ]);

    const keywordResults = keywordResponse.results
      .map((hit, index) => mapSearchHitToResult(hit, index, query, cql, this.options.config))
      .filter((result): result is NonNullable<typeof result> => result !== null);
    const hybridResults = buildHybridSearchResults({
      cql,
      keywordResults,
      semanticResults: semanticResults.map(mapSemanticSearchResultToResult),
      topK: candidateTopK,
    });
    const policyResult = await applySearchRagPolicy({
      queryInput: input,
      cqlUsed: cql,
      requestedTopK,
      policy: ragPolicy,
      results: hybridResults,
      confluenceClient: this.options.confluenceClient,
      metrics: this.options.metrics,
    });

    return {
      retrievalModeUsed: "hybrid",
      policyApplied: policyResult.policyApplied,
      results: policyResult.results,
      nextCursor: resolvePaginationInfo({ links: keywordResponse._links }).nextCursor,
      debug: policyResult.debug,
    };
  }
}
