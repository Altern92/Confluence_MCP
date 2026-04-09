import { htmlToText } from "../confluence/formatting.js";
import type { SearchToolOutput } from "../types/tool-schemas.js";
import type { DocumentIndexStore } from "../indexing/storage-ports.js";
import type { CitationCorrectnessResult } from "./types.js";

function normalizeForComparison(value: string | null | undefined) {
  return htmlToText(value ?? "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export class CitationCorrectnessValidator {
  constructor(private readonly indexStore: Pick<DocumentIndexStore, "getPageDocument">) {}

  validateSearchResult(result: SearchToolOutput["results"][number]): CitationCorrectnessResult {
    const snippet = normalizeForComparison(result.snippet);
    const title = normalizeForComparison(result.title);

    if (!snippet) {
      return {
        pageId: result.pageId,
        snippet: result.snippet,
        status: "incorrect",
        evidenceSource: "no_match",
        matchedChunkId: null,
      };
    }

    if (snippet === title) {
      return {
        pageId: result.pageId,
        snippet: result.snippet,
        status: "unknown",
        evidenceSource: "title_fallback",
        matchedChunkId: null,
      };
    }

    const record = this.indexStore.getPageDocument(result.pageId);

    if (!record) {
      return {
        pageId: result.pageId,
        snippet: result.snippet,
        status: "unknown",
        evidenceSource: "missing_document",
        matchedChunkId: null,
      };
    }

    const normalizedBody = normalizeForComparison(record.document.body);

    if (normalizedBody.includes(snippet)) {
      return {
        pageId: result.pageId,
        snippet: result.snippet,
        status: "correct",
        evidenceSource: "document_body",
        matchedChunkId: null,
      };
    }

    const matchedChunk = record.chunks.find((chunk) =>
      normalizeForComparison(chunk.content).includes(snippet),
    );

    if (matchedChunk) {
      return {
        pageId: result.pageId,
        snippet: result.snippet,
        status: "correct",
        evidenceSource: "chunk",
        matchedChunkId: matchedChunk.chunkId,
      };
    }

    return {
      pageId: result.pageId,
      snippet: result.snippet,
      status: "incorrect",
      evidenceSource: "no_match",
      matchedChunkId: null,
    };
  }

  validateMany(results: SearchToolOutput["results"]) {
    return results.map((result) => this.validateSearchResult(result));
  }
}
