import { describe, expect, it } from "vitest";

import { InMemoryVectorStore } from "../../src/retrieval/memory-vector-store.js";

function createRecord(chunkId: string, pageId: string, spaceKey: string, embedding: number[]) {
  return {
    chunkId,
    documentId: `page:${pageId}`,
    pageId,
    content: `Content ${chunkId}`,
    metadata: {
      contentType: "page" as const,
      pageId,
      pageTitle: `Page ${pageId}`,
      spaceKey,
      ancestorIds: ["10"],
      sectionPath: [`Page ${pageId}`],
      lastModified: "2026-04-09T08:00:00Z",
      version: {
        number: 1,
        createdAt: "2026-04-09T08:00:00Z",
      },
      tenantId: "tenant-a",
      url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
      bodyFormat: "storage" as const,
    },
    embedding,
    updatedAt: "2026-04-09T08:00:00Z",
  };
}

describe("InMemoryVectorStore", () => {
  it("replaces per-page chunk sets and filters semantic search results", async () => {
    const store = new InMemoryVectorStore();

    store.upsertPageChunks("123", [
      createRecord("chunk-1", "123", "ENG", [1, 0]),
      createRecord("chunk-2", "123", "ENG", [0.8, 0.2]),
    ]);
    store.upsertPageChunks("456", [createRecord("chunk-3", "456", "OPS", [0, 1])]);

    const results = await store.search({
      embedding: [1, 0],
      topK: 5,
      filters: {
        spaceKey: "ENG",
      },
    });

    expect(await store.count()).toBe(3);
    expect(results.map((result) => result.record.chunkId)).toEqual(["chunk-1", "chunk-2"]);

    store.upsertPageChunks("123", [createRecord("chunk-4", "123", "ENG", [1, 0])]);

    expect((await store.list()).map((record) => record.chunkId)).toEqual(["chunk-3", "chunk-4"]);
  });
});
