import type { IndexedDocumentChunk, IndexableConfluencePage } from "../indexing/types.js";
import type { ScopeInput } from "../types/tool-schemas.js";
import { buildSearchSnippet } from "../domain/snippet-builder.js";
import type { EmbeddingService } from "./embedding-service.js";
import type { VectorStore } from "./vector-store.js";
import type {
  SemanticChunkRecord,
  SemanticSearchFilters,
  SemanticSearchPageResult,
} from "./types.js";

function nowIsoString() {
  return new Date().toISOString();
}

function buildFilters(scope: ScopeInput, tenantId?: string | null): SemanticSearchFilters {
  switch (scope.type) {
    case "page":
      return {
        pageId: scope.pageId,
        tenantId: tenantId ?? undefined,
      };
    case "page_tree":
      return {
        ancestorId: scope.pageId,
        tenantId: tenantId ?? undefined,
      };
    case "space":
      return {
        spaceKey: scope.spaceKey,
        tenantId: tenantId ?? undefined,
      };
  }
}

function mapChunkToSemanticRecord(
  document: IndexableConfluencePage,
  chunk: IndexedDocumentChunk,
  embedding: number[],
): SemanticChunkRecord {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    pageId: document.pageId,
    content: chunk.content,
    metadata: chunk.metadata,
    embedding,
    updatedAt: nowIsoString(),
  };
}

export class SemanticIndexer {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStore,
  ) {}

  async replacePage(document: IndexableConfluencePage, chunks: IndexedDocumentChunk[]) {
    const embeddings = await this.embeddingService.embedTexts(chunks.map((chunk) => chunk.content));
    const records = chunks.map((chunk, index) =>
      mapChunkToSemanticRecord(document, chunk, embeddings[index] ?? []),
    );

    await this.vectorStore.upsertPageChunks(document.pageId, records);
  }

  async removePages(pageIds: string[]) {
    if (pageIds.length === 0) {
      return;
    }

    await this.vectorStore.deletePageChunksMany(pageIds);
  }

  async search(input: {
    query: string;
    scope: ScopeInput;
    topK: number;
    tenantId?: string | null;
  }): Promise<SemanticSearchPageResult[]> {
    const embedding = await this.embeddingService.embedText(input.query);
    const matches = await this.vectorStore.search({
      embedding,
      topK: input.topK * 3,
      filters: buildFilters(input.scope, input.tenantId),
    });
    const bestByPageId = new Map<string, SemanticSearchPageResult>();

    for (const match of matches) {
      const existing = bestByPageId.get(match.record.pageId);

      if (existing && existing.score >= match.score) {
        continue;
      }

      bestByPageId.set(match.record.pageId, {
        rank: 0,
        score: match.score,
        pageId: match.record.pageId,
        title: match.record.metadata.pageTitle,
        spaceKey: match.record.metadata.spaceKey ?? "",
        url:
          match.record.metadata.url ??
          `https://example.invalid/wiki/pages/viewpage.action?pageId=${match.record.pageId}`,
        snippet: buildSearchSnippet(
          match.record.content,
          match.record.metadata.pageTitle,
          input.query,
        ),
        chunkId: match.record.chunkId,
        documentId: match.record.documentId,
        sectionPath: match.record.metadata.sectionPath,
        lastModified: match.record.metadata.lastModified,
        retrievedAt: nowIsoString(),
      });
    }

    return [...bestByPageId.values()]
      .sort((left, right) => right.score - left.score || left.pageId.localeCompare(right.pageId))
      .slice(0, input.topK)
      .map((result, index) => ({
        ...result,
        rank: index + 1,
      }));
  }
}
