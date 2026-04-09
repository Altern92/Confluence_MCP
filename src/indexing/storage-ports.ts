import type { IndexedDocumentChunk, IndexableConfluencePage } from "./types.js";
import type { ReindexReason, SyncRunRecord, SyncRunStats, SyncWatermark } from "./sync-types.js";

export type IndexedDocumentRecord = {
  pageId: string;
  document: IndexableConfluencePage;
  chunks: IndexedDocumentChunk[];
  indexedAt: string;
};

export interface DocumentIndexStore {
  upsertPageDocument(input: {
    document: IndexableConfluencePage;
    chunks: IndexedDocumentChunk[];
  }): IndexedDocumentRecord;
  getPageDocument(pageId: string): IndexedDocumentRecord | null;
  listPageDocuments(): IndexedDocumentRecord[];
  listPageDocumentsBySpace(spaceKey: string): IndexedDocumentRecord[];
  countDocuments(): number;
  countChunks(): number;
  deletePageDocument(pageId: string): IndexedDocumentRecord | null;
  deleteDocumentsMissingFromSpace(
    spaceKey: string,
    retainedPageIds: Iterable<string>,
  ): IndexedDocumentRecord[];
}

export interface SyncStateStore {
  getWatermark(scopeKey: string): SyncWatermark | null;
  listWatermarks(): SyncWatermark[];
  upsertWatermark(scopeKey: string, lastModified: string): SyncWatermark;
  createPageReindexRun(pageId: string, reason: ReindexReason): SyncRunRecord;
  createSpaceReindexRun(spaceKey: string, reason: ReindexReason): SyncRunRecord;
  createFullReindexRun(reason: ReindexReason): SyncRunRecord;
  getRun(runId: string): SyncRunRecord | null;
  listRuns(): SyncRunRecord[];
  markRunRunning(runId: string): SyncRunRecord;
  markRunSucceeded(runId: string, stats: SyncRunStats): SyncRunRecord;
  markRunFailed(runId: string, errorMessage: string): SyncRunRecord;
}
