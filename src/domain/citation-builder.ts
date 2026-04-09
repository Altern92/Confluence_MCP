export function buildKeywordProvenance(cql: string) {
  return {
    source: "confluence_keyword" as const,
    cql,
  };
}

export function buildSemanticProvenance(details: {
  chunkId: string;
  documentId: string;
  similarity: number;
}) {
  return {
    source: "vector_semantic" as const,
    chunkId: details.chunkId,
    documentId: details.documentId,
    similarity: details.similarity,
  };
}

export function buildHybridProvenance(details: {
  cql: string;
  keywordRank: number | null;
  semanticRank: number | null;
  rrfScore: number;
}) {
  return {
    source: "hybrid_rrf" as const,
    cql: details.cql,
    keywordRank: details.keywordRank,
    semanticRank: details.semanticRank,
    rrfScore: details.rrfScore,
  };
}
