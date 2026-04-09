import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { FileDocumentIndexStore } from "../../src/indexing/file-document-index-store.js";

function createDocument(pageId: string, spaceKey: string) {
  return {
    contentType: "page" as const,
    pageId,
    title: `Page ${pageId}`,
    spaceKey,
    ancestorIds: [],
    body: `<p>Body ${pageId}</p>`,
    bodyFormat: "storage" as const,
    lastModified: "2026-04-09T08:00:00Z",
    version: {
      number: 1,
      createdAt: "2026-04-09T08:00:00Z",
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
      lastModified: "2026-04-09T08:00:00Z",
      version: {
        number: 1,
        createdAt: "2026-04-09T08:00:00Z",
      },
      tenantId: "tenant-a",
      url: `https://example.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`,
      bodyFormat: "storage" as const,
    },
  };
}

const directories: string[] = [];

function createStorePath() {
  const directory = mkdtempSync(join(tmpdir(), "confluence-mcp-index-"));
  directories.push(directory);
  return join(directory, "documents.json");
}

afterEach(() => {
  for (const directory of directories.splice(0, directories.length)) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }
});

describe("FileDocumentIndexStore", () => {
  it("persists documents across store instances", () => {
    const filePath = createStorePath();
    const store = new FileDocumentIndexStore(filePath);

    store.upsertPageDocument({
      document: createDocument("123", "ENG"),
      chunks: [createChunk("123", "ENG")],
    });

    const reloadedStore = new FileDocumentIndexStore(filePath);

    expect(reloadedStore.countDocuments()).toBe(1);
    expect(reloadedStore.countChunks()).toBe(1);
    expect(reloadedStore.getPageDocument("123")?.document.spaceKey).toBe("ENG");
  });

  it("deletes stale documents by space and persists the result", () => {
    const filePath = createStorePath();
    const store = new FileDocumentIndexStore(filePath);

    store.upsertPageDocument({
      document: createDocument("123", "ENG"),
      chunks: [createChunk("123", "ENG")],
    });
    store.upsertPageDocument({
      document: createDocument("456", "ENG"),
      chunks: [createChunk("456", "ENG")],
    });
    store.upsertPageDocument({
      document: createDocument("999", "OPS"),
      chunks: [createChunk("999", "OPS")],
    });

    const removed = store.deleteDocumentsMissingFromSpace("ENG", ["123"]);
    const reloadedStore = new FileDocumentIndexStore(filePath);

    expect(removed.map((record) => record.pageId)).toEqual(["456"]);
    expect(reloadedStore.listPageDocuments().map((record) => record.pageId)).toEqual([
      "123",
      "999",
    ]);
  });

  it("refreshes reads after another store instance writes to the same file", () => {
    const filePath = createStorePath();
    const longLivedStore = new FileDocumentIndexStore(filePath);
    const externalWriter = new FileDocumentIndexStore(filePath);

    externalWriter.upsertPageDocument({
      document: createDocument("777", "ENG"),
      chunks: [createChunk("777", "ENG")],
    });

    expect(longLivedStore.countDocuments()).toBe(1);
    expect(longLivedStore.getPageDocument("777")?.document.title).toBe("Page 777");
  });
});
