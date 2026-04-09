import {
  ConfluenceForbiddenError,
  ConfluenceValidationError,
  type ConfluenceClientError,
} from "../confluence/errors.js";
import type { ConfluenceClient } from "../confluence/client.js";
import type { MetricsRegistry } from "../observability/metrics-registry.js";
import type {
  SearchToolInput,
  SearchToolOutput,
  SearchToolOutput as SearchOutput,
} from "../types/tool-schemas.js";

const DEFAULT_POLICY_ID = "default-secure-rag" as const;
const DEFAULT_MAX_TOP_K = 20;
const DEFAULT_MAX_SNIPPET_CHARS = 600;
const DEFAULT_MAX_VERIFICATIONS = 12;
const MAX_RETRIEVAL_CANDIDATES = 50;

export type SearchRagPolicyId = typeof DEFAULT_POLICY_ID;

export type SearchRagPolicy = {
  policyId: SearchRagPolicyId;
  scopeRequired: true;
  citationFirst: true;
  preRetrieval: {
    maxTopK: number;
    maxSnippetChars: number;
  };
  verification: {
    required: true;
    mode: "service_v2_fetch";
    maxVerifications: number;
  };
  attachments: {
    allowAttachments: false;
  };
};

export type SearchRagDebug = NonNullable<SearchToolOutput["debug"]>;

type SearchVerificationDropReason = keyof SearchRagDebug["dropReasons"];

type SearchResult = SearchOutput["results"][number];

export const DEFAULT_SECURE_RAG_POLICY: SearchRagPolicy = {
  policyId: DEFAULT_POLICY_ID,
  scopeRequired: true,
  citationFirst: true,
  preRetrieval: {
    maxTopK: DEFAULT_MAX_TOP_K,
    maxSnippetChars: DEFAULT_MAX_SNIPPET_CHARS,
  },
  verification: {
    required: true,
    mode: "service_v2_fetch",
    maxVerifications: DEFAULT_MAX_VERIFICATIONS,
  },
  attachments: {
    allowAttachments: false,
  },
};

function trimSnippetToWordBoundary(value: string) {
  const lastWhitespaceIndex = value.search(/\s(?=[^\s]*$)/);
  return lastWhitespaceIndex === -1 ? value : value.slice(0, lastWhitespaceIndex);
}

function truncateSnippet(value: string, maxSnippetChars: number) {
  if (value.length <= maxSnippetChars) {
    return value;
  }

  return `${trimSnippetToWordBoundary(value.slice(0, maxSnippetChars)).trimEnd()}...`;
}

function buildEmptyDropReasons(): SearchRagDebug["dropReasons"] {
  return {
    forbidden: 0,
    notFound: 0,
    error: 0,
  };
}

function classifyVerificationDropReason(
  error: ConfluenceClientError,
): SearchVerificationDropReason {
  if (error instanceof ConfluenceForbiddenError) {
    return "forbidden";
  }

  if (error instanceof ConfluenceValidationError && error.status === 404) {
    return "notFound";
  }

  return "error";
}

async function verifySearchResult(
  client: ConfluenceClient,
  result: SearchResult,
): Promise<SearchResult> {
  await client.getPage(result.pageId, "storage");

  return {
    ...result,
    verificationStatus: "verified_service_v2_fetch",
  };
}

function buildPolicyApplied(policy: SearchRagPolicy): SearchToolOutput["policyApplied"] {
  return {
    policyId: policy.policyId,
    verificationRequired: policy.verification.required,
    verificationMode: policy.verification.mode,
    maxTopK: policy.preRetrieval.maxTopK,
    maxSnippetChars: policy.preRetrieval.maxSnippetChars,
    maxVerifications: policy.verification.maxVerifications,
    citationFirst: policy.citationFirst,
  };
}

function applySnippetCap(
  results: SearchToolOutput["results"],
  maxSnippetChars: number,
): SearchToolOutput["results"] {
  return results.map((result) => ({
    ...result,
    snippet: truncateSnippet(result.snippet, maxSnippetChars),
  }));
}

export function resolveSearchRagPolicy(policyId: SearchToolInput["ragPolicyId"]): SearchRagPolicy {
  if (!policyId || policyId === DEFAULT_POLICY_ID) {
    return DEFAULT_SECURE_RAG_POLICY;
  }

  return DEFAULT_SECURE_RAG_POLICY;
}

export function computeAppliedSearchTopK(input: {
  requestedTopK: number;
  policy: SearchRagPolicy;
}) {
  const topK = Math.min(
    input.requestedTopK,
    input.policy.preRetrieval.maxTopK,
    input.policy.verification.required
      ? input.policy.verification.maxVerifications
      : input.policy.preRetrieval.maxTopK,
  );

  return Math.max(topK, 1);
}

export function computeSearchCandidateTopK(input: {
  requestedTopK: number;
  policy: SearchRagPolicy;
}) {
  const appliedTopK = computeAppliedSearchTopK(input);
  return Math.min(Math.max(appliedTopK * 2, appliedTopK), MAX_RETRIEVAL_CANDIDATES);
}

export async function applySearchRagPolicy(input: {
  queryInput: SearchToolInput;
  cqlUsed: string | null;
  requestedTopK: number;
  policy: SearchRagPolicy;
  results: SearchToolOutput["results"];
  confluenceClient: ConfluenceClient;
  metrics?: MetricsRegistry;
}): Promise<Pick<SearchToolOutput, "results" | "policyApplied" | "debug">> {
  const topKApplied = computeAppliedSearchTopK({
    requestedTopK: input.requestedTopK,
    policy: input.policy,
  });
  const dropReasons = buildEmptyDropReasons();
  const snippetCappedResults = applySnippetCap(
    input.results,
    input.policy.preRetrieval.maxSnippetChars,
  );
  const candidates = snippetCappedResults.slice(0, topKApplied);
  const verifiedResults: SearchToolOutput["results"] = [];
  let verifiedCandidates = 0;

  if (input.policy.verification.required) {
    for (const candidate of candidates) {
      try {
        const verifiedResult = await verifySearchResult(input.confluenceClient, candidate);
        verifiedResults.push(verifiedResult);
        verifiedCandidates += 1;
      } catch (error) {
        const dropReason = classifyVerificationDropReason(error as ConfluenceClientError);
        dropReasons[dropReason] += 1;
        input.metrics?.recordSearchVerification({
          requestMode: input.queryInput.retrieval?.mode ?? "keyword",
          outcome: "dropped",
          reason: dropReason,
        });
      }
    }
  } else {
    verifiedResults.push(
      ...candidates.map((candidate) => ({
        ...candidate,
        verificationStatus: "not_required" as const,
      })),
    );
  }

  if (input.policy.verification.required && verifiedCandidates > 0) {
    input.metrics?.recordSearchVerification({
      requestMode: input.queryInput.retrieval?.mode ?? "keyword",
      outcome: "verified",
    });
  }

  return {
    results: verifiedResults,
    policyApplied: buildPolicyApplied(input.policy),
    debug: input.queryInput.debug
      ? {
          cqlUsed: input.cqlUsed,
          topKRequested: input.requestedTopK,
          topKApplied,
          verifiedCandidates,
          droppedCandidates: dropReasons.forbidden + dropReasons.notFound + dropReasons.error,
          dropReasons,
          verificationMode: input.policy.verification.mode,
        }
      : null,
  };
}
