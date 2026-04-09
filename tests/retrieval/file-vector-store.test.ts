import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { FileVectorStore } from "../../src/retrieval/file-vector-store.js";

const directories: string[] = [];

function createStorePath() {
  const directory = mkdtempSync(join(tmpdir(), "confluence-mcp-vectors-"));
  directories.push(directory);
  return join(directory, "vectors.json");
}

function createRecord(chunkId: string) {
  return {
    chunkId,
    documentId: "page:123",
    pageId: "123",
    content: "Release notes body",
    metadata: {
      contentType: "page" as const,
      pageId: "123",
      pageTitle: "Release Notes",
      spaceKey: "ENG",
      ancestorIds: ["10"],
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
    embedding: [1, 0, 0],
    updatedAt: "2026-04-09T08:00:00Z",
  };
}

afterEach(() => {
  for (const directory of directories.splice(0, directories.length)) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }
});

describe("FileVectorStore", () => {
  it("persists semantic chunk records across instances", async () => {
    const filePath = createStorePath();
    const store = new FileVectorStore(filePath);

    store.upsertPageChunks("123", [createRecord("chunk-1"), createRecord("chunk-2")]);

    const reloadedStore = new FileVectorStore(filePath);
    const results = await reloadedStore.search({
      embedding: [1, 0, 0],
      topK: 10,
    });

    expect(await reloadedStore.count()).toBe(2);
    expect(results).toHaveLength(2);
  });

  it("refreshes reads after another store instance writes to the same file", async () => {
    const filePath = createStorePath();
    const longLivedStore = new FileVectorStore(filePath);
    const externalWriter = new FileVectorStore(filePath);

    externalWriter.upsertPageChunks("123", [createRecord("chunk-1")]);

    expect(await longLivedStore.count()).toBe(1);
    expect(await longLivedStore.search({ embedding: [1, 0, 0], topK: 5 })).toHaveLength(1);
  });
});
