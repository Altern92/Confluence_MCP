import { describe, expect, it } from "vitest";

import { InMemoryDocumentIndexStore } from "../../src/indexing/index-store.js";

function createDocument(pageId: string, spaceKey: string) {
  return {
    contentType: "page" as const,
    pageId,
    title: `Page ${pageId}`,
    spaceKey,
    ancestorIds: [],
    body: `Body ${pageId}`,
    bodyFormat: "storage" as const,
    lastModified: "2026-04-08T10:00:00Z",
    version: {
      number: 1,
      createdAt: "2026-04-08T10:00:00Z",
    },
    tenantId: "tenant-a",
    url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
  };
}

function createChunk(pageId: string, spaceKey: string) {
  return {
    chunkId: `chunk:${pageId}:0`,
    documentId: `page:${pageId}`,
    chunkIndex: 0,
    content: `Body ${pageId}`,
    charCount: `Body ${pageId}`.length,
    metadata: {
      contentType: "page" as const,
      pageId,
      pageTitle: `Page ${pageId}`,
      spaceKey,
      ancestorIds: [],
      sectionPath: [`Page ${pageId}`],
      lastModified: "2026-04-08T10:00:00Z",
      version: {
        number: 1,
        createdAt: "2026-04-08T10:00:00Z",
      },
      tenantId: "tenant-a",
      url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
      bodyFormat: "storage" as const,
    },
  };
}

describe("InMemoryDocumentIndexStore", () => {
  it("upserts page documents and exposes counts", () => {
    const store = new InMemoryDocumentIndexStore();

    const record = store.upsertPageDocument({
      document: createDocument("123", "ENG"),
      chunks: [createChunk("123", "ENG")],
    });

    expect(record.pageId).toBe("123");
    expect(store.getPageDocument("123")?.pageId).toBe("123");
    expect(store.countDocuments()).toBe(1);
    expect(store.countChunks()).toBe(1);
  });

  it("lists page documents sorted by page id and filtered by space", () => {
    const store = new InMemoryDocumentIndexStore();

    store.upsertPageDocument({
      document: createDocument("200", "OPS"),
      chunks: [createChunk("200", "OPS")],
    });
    store.upsertPageDocument({
      document: createDocument("100", "ENG"),
      chunks: [createChunk("100", "ENG")],
    });
    store.upsertPageDocument({
      document: createDocument("150", "ENG"),
      chunks: [createChunk("150", "ENG")],
    });

    expect(store.listPageDocuments().map((record) => record.pageId)).toEqual(["100", "150", "200"]);
    expect(store.listPageDocumentsBySpace("ENG").map((record) => record.pageId)).toEqual([
      "100",
      "150",
    ]);
  });

  it("deletes missing documents only within the target space", () => {
    const store = new InMemoryDocumentIndexStore();

    store.upsertPageDocument({
      document: createDocument("100", "ENG"),
      chunks: [createChunk("100", "ENG")],
    });
    store.upsertPageDocument({
      document: createDocument("150", "ENG"),
      chunks: [createChunk("150", "ENG")],
    });
    store.upsertPageDocument({
      document: createDocument("200", "OPS"),
      chunks: [createChunk("200", "OPS")],
    });

    const removed = store.deleteDocumentsMissingFromSpace("ENG", ["150"]);

    expect(removed.map((record) => record.pageId)).toEqual(["100"]);
    expect(store.listPageDocumentsBySpace("ENG").map((record) => record.pageId)).toEqual(["150"]);
    expect(store.listPageDocumentsBySpace("OPS").map((record) => record.pageId)).toEqual(["200"]);
  });
});
