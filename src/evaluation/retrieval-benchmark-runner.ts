import type { ConfluenceContentServicePort } from "../domain/confluence-content-service.js";
import type { DocumentIndexStore } from "../indexing/storage-ports.js";
import type { RetrievalInput } from "../types/tool-schemas.js";
import { CitationCorrectnessValidator } from "./citation-correctness-validator.js";
import type {
  BenchmarkMode,
  KeywordHybridComparison,
  RetrievalBenchmarkReport,
  RetrievalBenchmarkSuite,
  RetrievalCaseModeEvaluation,
  RetrievalModeSummary,
} from "./types.js";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOrNull(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return average(values);
}

function buildSummary(
  requestedMode: BenchmarkMode,
  evaluations: RetrievalCaseModeEvaluation[],
): RetrievalModeSummary {
  const citationRates = evaluations
    .map((evaluation) => evaluation.citationCorrectnessRate)
    .filter((rate): rate is number => rate != null);

  return {
    requestedMode,
    runs: evaluations.length,
    avgRecallAtK: average(evaluations.map((evaluation) => evaluation.recallAtK)),
    avgMrr: average(evaluations.map((evaluation) => evaluation.mrr)),
    avgCitationCorrectnessRate: averageOrNull(citationRates),
    citationCorrectCount: evaluations.reduce(
      (sum, evaluation) => sum + evaluation.citationCorrectCount,
      0,
    ),
    citationIncorrectCount: evaluations.reduce(
      (sum, evaluation) => sum + evaluation.citationIncorrectCount,
      0,
    ),
    citationUnknownCount: evaluations.reduce(
      (sum, evaluation) => sum + evaluation.citationUnknownCount,
      0,
    ),
  };
}

function buildKeywordVsHybridComparison(
  evaluations: RetrievalCaseModeEvaluation[],
): KeywordHybridComparison | null {
  const groupedByCase = new Map<
    string,
    Partial<Record<BenchmarkMode, RetrievalCaseModeEvaluation>>
  >();

  for (const evaluation of evaluations) {
    const current = groupedByCase.get(evaluation.caseId) ?? {};
    current[evaluation.requestedMode] = evaluation;
    groupedByCase.set(evaluation.caseId, current);
  }

  const comparablePairs = [...groupedByCase.values()]
    .map((entry) => ({
      keyword: entry.keyword ?? null,
      hybrid: entry.hybrid ?? null,
    }))
    .filter(
      (
        pair,
      ): pair is {
        keyword: RetrievalCaseModeEvaluation;
        hybrid: RetrievalCaseModeEvaluation;
      } => pair.keyword != null && pair.hybrid != null,
    );

  if (comparablePairs.length === 0) {
    return null;
  }

  return {
    casesCompared: comparablePairs.length,
    hybridBetterRecallCases: comparablePairs.filter(
      (pair) => pair.hybrid.recallAtK > pair.keyword.recallAtK,
    ).length,
    hybridBetterMrrCases: comparablePairs.filter((pair) => pair.hybrid.mrr > pair.keyword.mrr)
      .length,
    avgRecallDelta: average(
      comparablePairs.map((pair) => pair.hybrid.recallAtK - pair.keyword.recallAtK),
    ),
    avgMrrDelta: average(comparablePairs.map((pair) => pair.hybrid.mrr - pair.keyword.mrr)),
  };
}

export class RetrievalBenchmarkRunner {
  private readonly citationValidator: CitationCorrectnessValidator;

  constructor(
    private readonly contentService: Pick<ConfluenceContentServicePort, "search">,
    indexStore: Pick<DocumentIndexStore, "getPageDocument">,
  ) {
    this.citationValidator = new CitationCorrectnessValidator(indexStore);
  }

  async runSuite(suite: RetrievalBenchmarkSuite): Promise<RetrievalBenchmarkReport> {
    const evaluations: RetrievalCaseModeEvaluation[] = [];

    for (const benchmarkCase of suite.cases) {
      for (const requestedMode of benchmarkCase.modes) {
        const retrieval: RetrievalInput = {
          mode: requestedMode,
          topK: benchmarkCase.topK,
        };
        const output = await this.contentService.search({
          query: benchmarkCase.query,
          scope: benchmarkCase.scope,
          retrieval,
        });
        const returnedPageIds = output.results.map((result) => result.pageId);
        const firstRelevantRank =
          output.results.find((result) => benchmarkCase.expectedPageIds.includes(result.pageId))
            ?.rank ?? null;
        const foundExpectedCount = benchmarkCase.expectedPageIds.filter((pageId) =>
          returnedPageIds.includes(pageId),
        ).length;
        const citationResults = this.citationValidator.validateMany(output.results);
        const citationCorrectCount = citationResults.filter(
          (result) => result.status === "correct",
        ).length;
        const citationIncorrectCount = citationResults.filter(
          (result) => result.status === "incorrect",
        ).length;
        const citationUnknownCount = citationResults.filter(
          (result) => result.status === "unknown",
        ).length;
        const measurableCitationCount = citationCorrectCount + citationIncorrectCount;

        evaluations.push({
          caseId: benchmarkCase.id,
          requestedMode,
          retrievalModeUsed: output.retrievalModeUsed,
          expectedPageIds: benchmarkCase.expectedPageIds,
          returnedPageIds,
          topK: benchmarkCase.topK,
          recallAtK:
            benchmarkCase.expectedPageIds.length === 0
              ? 0
              : foundExpectedCount / benchmarkCase.expectedPageIds.length,
          mrr: firstRelevantRank ? 1 / firstRelevantRank : 0,
          firstRelevantRank,
          citationCorrectCount,
          citationIncorrectCount,
          citationUnknownCount,
          citationCorrectnessRate:
            measurableCitationCount === 0 ? null : citationCorrectCount / measurableCitationCount,
          citationResults,
        });
      }
    }

    const summaries = (["keyword", "semantic", "hybrid"] as const)
      .map((requestedMode) => ({
        requestedMode,
        evaluations: evaluations.filter((evaluation) => evaluation.requestedMode === requestedMode),
      }))
      .filter((entry) => entry.evaluations.length > 0)
      .map((entry) => buildSummary(entry.requestedMode, entry.evaluations));

    return {
      suiteId: suite.suiteId,
      generatedAt: new Date().toISOString(),
      cases: evaluations,
      summaries,
      keywordVsHybrid: buildKeywordVsHybridComparison(evaluations),
    };
  }
}
