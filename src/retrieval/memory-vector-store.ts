import type { VectorStore } from "./vector-store.js";
import type { SemanticChunkRecord, SemanticSearchFilters, SemanticSearchMatch } from "./types.js";

function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function matchesFilters(record: SemanticChunkRecord, filters?: SemanticSearchFilters) {
  if (!filters) {
    return true;
  }

  if (filters.pageId && record.pageId !== filters.pageId) {
    return false;
  }

  if (filters.spaceKey && record.metadata.spaceKey !== filters.spaceKey) {
    return false;
  }

  if (filters.ancestorId && !record.metadata.ancestorIds.includes(filters.ancestorId)) {
    return false;
  }

  if (filters.tenantId !== undefined && record.metadata.tenantId !== filters.tenantId) {
    return false;
  }

  return true;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, SemanticChunkRecord>();

  upsertPageChunks(pageId: string, records: SemanticChunkRecord[]) {
    for (const [chunkId, record] of this.records.entries()) {
      if (record.pageId === pageId) {
        this.records.delete(chunkId);
      }
    }

    for (const record of records) {
      this.records.set(record.chunkId, record);
    }
  }

  deletePageChunks(pageId: string) {
    for (const [chunkId, record] of this.records.entries()) {
      if (record.pageId === pageId) {
        this.records.delete(chunkId);
      }
    }
  }

  deletePageChunksMany(pageIds: string[]) {
    const pageIdSet = new Set(pageIds);

    for (const [chunkId, record] of this.records.entries()) {
      if (pageIdSet.has(record.pageId)) {
        this.records.delete(chunkId);
      }
    }
  }

  async search(input: {
    embedding: number[];
    topK: number;
    filters?: SemanticSearchFilters;
  }): Promise<SemanticSearchMatch[]> {
    return [...this.records.values()]
      .filter((record) => matchesFilters(record, input.filters))
      .map((record) => ({
        score: cosineSimilarity(input.embedding, record.embedding),
        record,
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.record.chunkId.localeCompare(right.record.chunkId),
      )
      .slice(0, input.topK)
      .map((candidate, index) => ({
        rank: index + 1,
        score: candidate.score,
        record: candidate.record,
      }));
  }

  count() {
    return this.records.size;
  }

  list() {
    return [...this.records.values()].sort((left, right) =>
      left.chunkId.localeCompare(right.chunkId),
    );
  }
}
