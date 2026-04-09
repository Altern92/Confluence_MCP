import type { IndexedDocumentChunk, IndexableConfluencePage } from "./types.js";
import { buildIndexedChunksFromPage, type ChunkingOptions } from "./chunking.js";
import {
  buildIndexablePageSnapshot,
  type BuildIndexablePageSnapshotInput,
} from "./page-snapshot.js";
import type { SemanticIndexer } from "../retrieval/semantic-indexer.js";
import type { DocumentIndexStore, SyncStateStore } from "./storage-ports.js";
import type { ReindexReason, SyncRunRecord } from "./sync-types.js";

type IndexedDocumentRecordPort = Pick<DocumentIndexStore, "getPageDocument" | "upsertPageDocument">;

export type PageSyncInput = BuildIndexablePageSnapshotInput & {
  reason: ReindexReason;
  chunking?: ChunkingOptions;
};

export type PreparedPageSyncResult = {
  run: SyncRunRecord;
  document: IndexableConfluencePage;
  chunks: IndexedDocumentChunk[];
  outcome: "indexed" | "unchanged";
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function isDocumentUnchanged(left: IndexableConfluencePage, right: IndexableConfluencePage) {
  return (
    left.contentType === right.contentType &&
    left.pageId === right.pageId &&
    left.title === right.title &&
    left.spaceKey === right.spaceKey &&
    arraysEqual(left.ancestorIds, right.ancestorIds) &&
    left.body === right.body &&
    left.bodyFormat === right.bodyFormat &&
    left.lastModified === right.lastModified &&
    left.version.number === right.version.number &&
    left.version.createdAt === right.version.createdAt &&
    left.tenantId === right.tenantId &&
    left.url === right.url
  );
}

export class PageSyncCoordinator {
  constructor(
    private readonly stateStore: SyncStateStore,
    private readonly indexStore?: IndexedDocumentRecordPort,
    private readonly semanticIndexer?: Pick<SemanticIndexer, "replacePage">,
  ) {}

  async syncPage(input: PageSyncInput): Promise<PreparedPageSyncResult> {
    const queuedRun = this.stateStore.createPageReindexRun(input.page.pageId, input.reason);
    this.stateStore.markRunRunning(queuedRun.runId);

    try {
      const document = buildIndexablePageSnapshot(input);
      const existingRecord = this.indexStore?.getPageDocument(input.page.pageId) ?? null;

      if (existingRecord && isDocumentUnchanged(existingRecord.document, document)) {
        if (input.lastModified) {
          this.stateStore.upsertWatermark(`page:${input.page.pageId}`, input.lastModified);

          if (input.spaceKey) {
            this.stateStore.upsertWatermark(`space:${input.spaceKey}`, input.lastModified);
          }
        }

        const run = this.stateStore.markRunSucceeded(queuedRun.runId, {
          pagesDiscovered: 1,
          pagesIndexed: 0,
          pagesDeleted: 0,
          chunksProduced: 0,
        });

        return {
          run,
          document,
          chunks: existingRecord.chunks,
          outcome: "unchanged",
        };
      }

      const chunks = buildIndexedChunksFromPage(document, input.chunking);
      this.indexStore?.upsertPageDocument({
        document,
        chunks,
      });
      await this.semanticIndexer?.replacePage(document, chunks);

      if (input.lastModified) {
        this.stateStore.upsertWatermark(`page:${input.page.pageId}`, input.lastModified);

        if (input.spaceKey) {
          this.stateStore.upsertWatermark(`space:${input.spaceKey}`, input.lastModified);
        }
      }

      const run = this.stateStore.markRunSucceeded(queuedRun.runId, {
        pagesDiscovered: 1,
        pagesIndexed: 1,
        pagesDeleted: 0,
        chunksProduced: chunks.length,
      });

      return {
        run,
        document,
        chunks,
        outcome: "indexed",
      };
    } catch (error) {
      this.stateStore.markRunFailed(
        queuedRun.runId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
