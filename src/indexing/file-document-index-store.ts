import * as z from "zod/v4";

import { indexedDocumentChunkSchema, indexableConfluencePageSchema } from "./types.js";
import type { DocumentIndexStore, IndexedDocumentRecord } from "./storage-ports.js";
import { readJsonFile, writeJsonFileAtomic } from "./file-storage.js";

const indexedDocumentRecordSchema = z.object({
  pageId: z.string().trim().min(1),
  document: indexableConfluencePageSchema,
  chunks: z.array(indexedDocumentChunkSchema),
  indexedAt: z.string().trim().min(1),
});

const persistedDocumentIndexSchema = z.object({
  records: z.array(indexedDocumentRecordSchema).default([]),
});

function nowIsoString() {
  return new Date().toISOString();
}

export class FileDocumentIndexStore implements DocumentIndexStore {
  private documents = new Map<string, IndexedDocumentRecord>();

  constructor(private readonly filePath: string) {
    this.reloadFromDisk();
  }

  upsertPageDocument(input: {
    document: IndexedDocumentRecord["document"];
    chunks: IndexedDocumentRecord["chunks"];
  }): IndexedDocumentRecord {
    this.reloadFromDisk();

    const record: IndexedDocumentRecord = {
      pageId: input.document.pageId,
      document: input.document,
      chunks: input.chunks,
      indexedAt: nowIsoString(),
    };

    this.documents.set(record.pageId, record);
    this.persist();
    return record;
  }

  getPageDocument(pageId: string) {
    this.reloadFromDisk();
    return this.documents.get(pageId) ?? null;
  }

  listPageDocuments() {
    this.reloadFromDisk();
    return [...this.documents.values()].sort((left, right) =>
      left.pageId.localeCompare(right.pageId),
    );
  }

  listPageDocumentsBySpace(spaceKey: string) {
    return this.listPageDocuments().filter((record) => record.document.spaceKey === spaceKey);
  }

  countDocuments() {
    this.reloadFromDisk();
    return this.documents.size;
  }

  countChunks() {
    this.reloadFromDisk();
    return this.listPageDocuments().reduce((sum, record) => sum + record.chunks.length, 0);
  }

  deletePageDocument(pageId: string) {
    this.reloadFromDisk();
    const record = this.documents.get(pageId) ?? null;

    if (record) {
      this.documents.delete(pageId);
      this.persist();
    }

    return record;
  }

  deleteDocumentsMissingFromSpace(spaceKey: string, retainedPageIds: Iterable<string>) {
    this.reloadFromDisk();
    const retainedIds = new Set(retainedPageIds);
    const removed: IndexedDocumentRecord[] = [];

    for (const record of this.documents.values()) {
      if (record.document.spaceKey !== spaceKey) {
        continue;
      }

      if (retainedIds.has(record.pageId)) {
        continue;
      }

      this.documents.delete(record.pageId);
      removed.push(record);
    }

    if (removed.length > 0) {
      this.persist();
    }

    return removed.sort((left, right) => left.pageId.localeCompare(right.pageId));
  }

  private persist() {
    writeJsonFileAtomic(this.filePath, {
      records: [...this.documents.values()].sort((left, right) =>
        left.pageId.localeCompare(right.pageId),
      ),
    });
  }

  private reloadFromDisk() {
    const parsed = persistedDocumentIndexSchema.parse(readJsonFile(this.filePath, { records: [] }));
    this.documents = new Map(parsed.records.map((record) => [record.pageId, record]));
  }
}
