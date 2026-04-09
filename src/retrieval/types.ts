import type { IndexedChunkMetadata } from "../indexing/types.js";

export type EmbeddingVector = number[];

export type SemanticChunkRecord = {
  chunkId: string;
  documentId: string;
  pageId: string;
  content: string;
  metadata: IndexedChunkMetadata;
  embedding: EmbeddingVector;
  updatedAt: string;
};

export type SemanticSearchFilters = {
  pageId?: string;
  spaceKey?: string;
  ancestorId?: string;
  tenantId?: string | null;
};

export type SemanticSearchMatch = {
  rank: number;
  score: number;
  record: SemanticChunkRecord;
};

export type SemanticSearchPageResult = {
  rank: number;
  score: number;
  pageId: string;
  title: string;
  spaceKey: string;
  url: string;
  snippet: string;
  chunkId: string;
  documentId: string;
  sectionPath: string[];
  lastModified: string | null;
  retrievedAt: string;
};
