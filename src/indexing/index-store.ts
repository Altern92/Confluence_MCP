import type { DocumentIndexStore, IndexedDocumentRecord } from "./storage-ports.js";
import type { IndexedDocumentChunk, IndexableConfluencePage } from "./types.js";

function nowIsoString() {
  return new Date().toISOString();
}

export class InMemoryDocumentIndexStore implements DocumentIndexStore {
  private readonly documents = new Map<string, IndexedDocumentRecord>();

  upsertPageDocument(input: {
    document: IndexableConfluencePage;
    chunks: IndexedDocumentChunk[];
  }): IndexedDocumentRecord {
    const record: IndexedDocumentRecord = {
      pageId: input.document.pageId,
      document: input.document,
      chunks: input.chunks,
      indexedAt: nowIsoString(),
    };

    this.documents.set(record.pageId, record);
    return record;
  }

  getPageDocument(pageId: string) {
    return this.documents.get(pageId) ?? null;
  }

  listPageDocuments() {
    return [...this.documents.values()].sort((left, right) =>
      left.pageId.localeCompare(right.pageId),
    );
  }

  listPageDocumentsBySpace(spaceKey: string) {
    return this.listPageDocuments().filter((record) => record.document.spaceKey === spaceKey);
  }

  countDocuments() {
    return this.documents.size;
  }

  countChunks() {
    return this.listPageDocuments().reduce((sum, record) => sum + record.chunks.length, 0);
  }

  deletePageDocument(pageId: string) {
    const record = this.documents.get(pageId) ?? null;

    if (record) {
      this.documents.delete(pageId);
    }

    return record;
  }

  deleteDocumentsMissingFromSpace(spaceKey: string, retainedPageIds: Iterable<string>) {
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

    return removed.sort((left, right) => left.pageId.localeCompare(right.pageId));
  }
}
