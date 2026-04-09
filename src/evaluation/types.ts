import * as z from "zod/v4";

import { scopeSchema } from "../types/tool-schemas.js";

export const benchmarkModeSchema = z.enum(["keyword", "semantic", "hybrid"]);

export const retrievalBenchmarkCaseSchema = z.object({
  id: z.string().trim().min(1),
  query: z.string().trim().min(1),
  scope: scopeSchema,
  expectedPageIds: z.array(z.string().trim().min(1)).min(1),
  topK: z.number().int().min(1).max(50).default(10),
  modes: z.array(benchmarkModeSchema).min(1).default(["keyword", "hybrid"]),
  notes: z.string().trim().min(1).optional(),
});

export const retrievalBenchmarkSuiteSchema = z.object({
  suiteId: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  cases: z.array(retrievalBenchmarkCaseSchema).min(1),
});

export type BenchmarkMode = z.infer<typeof benchmarkModeSchema>;
export type RetrievalBenchmarkCase = z.infer<typeof retrievalBenchmarkCaseSchema>;
export type RetrievalBenchmarkSuite = z.infer<typeof retrievalBenchmarkSuiteSchema>;

export type CitationCorrectnessStatus = "correct" | "incorrect" | "unknown";

export type CitationCorrectnessResult = {
  pageId: string;
  snippet: string;
  status: CitationCorrectnessStatus;
  evidenceSource: "document_body" | "chunk" | "missing_document" | "title_fallback" | "no_match";
  matchedChunkId: string | null;
};

export type RetrievalCaseModeEvaluation = {
  caseId: string;
  requestedMode: BenchmarkMode;
  retrievalModeUsed: "keyword" | "semantic" | "hybrid";
  expectedPageIds: string[];
  returnedPageIds: string[];
  topK: number;
  recallAtK: number;
  mrr: number;
  firstRelevantRank: number | null;
  citationCorrectCount: number;
  citationIncorrectCount: number;
  citationUnknownCount: number;
  citationCorrectnessRate: number | null;
  citationResults: CitationCorrectnessResult[];
};

export type RetrievalModeSummary = {
  requestedMode: BenchmarkMode;
  runs: number;
  avgRecallAtK: number;
  avgMrr: number;
  avgCitationCorrectnessRate: number | null;
  citationCorrectCount: number;
  citationIncorrectCount: number;
  citationUnknownCount: number;
};

export type KeywordHybridComparison = {
  casesCompared: number;
  hybridBetterRecallCases: number;
  hybridBetterMrrCases: number;
  avgRecallDelta: number;
  avgMrrDelta: number;
};

export type RetrievalBenchmarkReport = {
  suiteId: string;
  generatedAt: string;
  cases: RetrievalCaseModeEvaluation[];
  summaries: RetrievalModeSummary[];
  keywordVsHybrid: KeywordHybridComparison | null;
};
