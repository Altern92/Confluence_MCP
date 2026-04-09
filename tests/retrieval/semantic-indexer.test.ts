import { describe, expect, it } from "vitest";

import { HashEmbeddingService } from "../../src/retrieval/hash-embedding-service.js";
import { InMemoryVectorStore } from "../../src/retrieval/memory-vector-store.js";
import { SemanticIndexer } from "../../src/retrieval/semantic-indexer.js";

function createDocument() {
  return {
    contentType: "page" as const,
    pageId: "123",
    title: "Release Notes",
    spaceKey: "ENG",
    ancestorIds: ["10", "20"],
    body: "<p>Deployment release checklist</p>",
    bodyFormat: "storage" as const,
    lastModified: "2026-04-09T08:00:00Z",
    version: {
      number: 1,
      createdAt: "2026-04-09T08:00:00Z",
    },
    tenantId: "tenant-a",
    url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
  };
}

function createChunks() {
  return [
    {
      chunkId: "chunk-1",
      documentId: "page:123",
      chunkIndex: 0,
      content: "deployment release checklist",
      charCount: 28,
      metadata: {
        contentType: "page" as const,
        pageId: "123",
        pageTitle: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: ["10", "20"],
        sectionPath: ["Release Notes"],
        lastModified: "2026-04-09T08:00:00Z",
        version: {
          number: 1,
          createdAt: "2026-04-09T08:00:00Z",
        },
        tenantId: "tenant-a",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage" as const,
      },
    },
  ];
}

describe("SemanticIndexer", () => {
  it("indexes chunks and returns scope-filtered semantic page results", async () => {
    const indexer = new SemanticIndexer(new HashEmbeddingService(64), new InMemoryVectorStore());

    await indexer.replacePage(createDocument(), createChunks());

    const results = await indexer.search({
      query: "deployment checklist",
      scope: {
        type: "space",
        spaceKey: "ENG",
      },
      topK: 5,
      tenantId: "tenant-a",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.pageId).toBe("123");
    expect(results[0]?.chunkId).toBe("chunk-1");
    expect(results[0]?.sectionPath).toEqual(["Release Notes"]);
    expect(results[0]?.lastModified).toBe("2026-04-09T08:00:00Z");
    expect(results[0]?.retrievedAt).toEqual(expect.any(String));
    expect(results[0]?.snippet.toLowerCase()).toContain("deployment");
  });
});
