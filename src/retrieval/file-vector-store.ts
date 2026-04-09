import * as z from "zod/v4";

import { readJsonFile, writeJsonFileAtomic } from "../indexing/file-storage.js";
import { indexedChunkMetadataSchema } from "../indexing/types.js";
import type { VectorStore } from "./vector-store.js";
import { InMemoryVectorStore } from "./memory-vector-store.js";
import type { SemanticChunkRecord, SemanticSearchFilters, SemanticSearchMatch } from "./types.js";

const semanticChunkRecordSchema = z.object({
  chunkId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  content: z.string(),
  metadata: indexedChunkMetadataSchema,
  embedding: z.array(z.number()),
  updatedAt: z.string().trim().min(1),
});

const persistedVectorStoreSchema = z.object({
  records: z.array(semanticChunkRecordSchema).default([]),
});

export class FileVectorStore implements VectorStore {
  private delegate = new InMemoryVectorStore();

  constructor(private readonly filePath: string) {
    this.reloadFromDisk();
  }

  upsertPageChunks(pageId: string, records: SemanticChunkRecord[]) {
    this.reloadFromDisk();
    this.delegate.upsertPageChunks(pageId, records);
    this.persist();
  }

  deletePageChunks(pageId: string) {
    this.reloadFromDisk();
    this.delegate.deletePageChunks(pageId);
    this.persist();
  }

  deletePageChunksMany(pageIds: string[]) {
    this.reloadFromDisk();
    this.delegate.deletePageChunksMany(pageIds);
    this.persist();
  }

  search(input: {
    embedding: number[];
    topK: number;
    filters?: SemanticSearchFilters;
  }): Promise<SemanticSearchMatch[]> {
    this.reloadFromDisk();
    return this.delegate.search(input);
  }

  count() {
    this.reloadFromDisk();
    return this.delegate.count();
  }

  list() {
    this.reloadFromDisk();
    return this.delegate.list();
  }

  private persist() {
    writeJsonFileAtomic(this.filePath, {
      records: this.delegate.list(),
    });
  }

  private reloadFromDisk() {
    const parsed = persistedVectorStoreSchema.parse(readJsonFile(this.filePath, { records: [] }));
    const delegate = new InMemoryVectorStore();
    const recordsByPageId = new Map<string, SemanticChunkRecord[]>();

    for (const record of parsed.records) {
      const current = recordsByPageId.get(record.pageId) ?? [];
      current.push(record);
      recordsByPageId.set(record.pageId, current);
    }

    for (const [pageId, records] of recordsByPageId.entries()) {
      delegate.upsertPageChunks(pageId, records);
    }

    this.delegate = delegate;
  }
}
