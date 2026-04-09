import type { SemanticChunkRecord, SemanticSearchFilters, SemanticSearchMatch } from "./types.js";

export type Awaitable<T> = T | Promise<T>;

export interface VectorStore {
  upsertPageChunks(pageId: string, records: SemanticChunkRecord[]): Awaitable<void>;
  deletePageChunks(pageId: string): Awaitable<void>;
  deletePageChunksMany(pageIds: string[]): Awaitable<void>;
  search(input: {
    embedding: number[];
    topK: number;
    filters?: SemanticSearchFilters;
  }): Awaitable<SemanticSearchMatch[]>;
  count(): Awaitable<number>;
  list(): Awaitable<SemanticChunkRecord[]>;
  close?(): Awaitable<void>;
}
