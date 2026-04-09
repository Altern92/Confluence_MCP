import { describe, expect, it, vi } from "vitest";

import { PostgresVectorStore } from "../../src/retrieval/postgres-vector-store.js";

function createRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chunk_id: "chunk-1",
    document_id: "page:123",
    page_id: "123",
    content: "deployment checklist",
    content_type: "page",
    page_title: "Release Notes",
    space_key: "ENG",
    ancestor_ids: ["10"],
    section_path: ["Release Notes"],
    last_modified: "2026-04-09T08:00:00Z",
    version_number: 1,
    version_created_at: "2026-04-09T08:00:00Z",
    tenant_id: "tenant-a",
    url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
    body_format: "storage",
    updated_at: "2026-04-09T08:00:00Z",
    score: 0.93,
    ...overrides,
  };
}

describe("PostgresVectorStore", () => {
  it("creates schema objects and maps semantic search rows", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [createRow()] });
    const end = vi.fn();
    const store = new PostgresVectorStore({
      connectionString: "postgres://postgres:postgres@localhost:5432/confluence_mcp",
      schema: "public",
      table: "semantic_chunks",
      dimensions: 3,
      ssl: false,
      autoInit: true,
      pool: {
        query,
        end,
      },
    });

    const results = await store.search({
      embedding: [1, 0, 0],
      topK: 5,
      filters: {
        spaceKey: "ENG",
        tenantId: "tenant-a",
      },
    });

    expect(query).toHaveBeenCalledWith("CREATE EXTENSION IF NOT EXISTS vector");
    expect(query).toHaveBeenCalledWith('CREATE SCHEMA IF NOT EXISTS "public"');
    expect(results).toEqual([
      {
        rank: 1,
        score: 0.93,
        record: {
          chunkId: "chunk-1",
          documentId: "page:123",
          pageId: "123",
          content: "deployment checklist",
          metadata: {
            contentType: "page",
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
            bodyFormat: "storage",
          },
          embedding: [],
          updatedAt: "2026-04-09T08:00:00Z",
        },
      },
    ]);

    await store.close();
    expect(end).not.toHaveBeenCalled();
  });

  it("upserts and counts records without auto init when schema is pre-created", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] });
    const store = new PostgresVectorStore({
      connectionString: "postgres://postgres:postgres@localhost:5432/confluence_mcp",
      schema: "public",
      table: "semantic_chunks",
      dimensions: 2,
      ssl: false,
      autoInit: false,
      pool: {
        query,
        end: vi.fn(),
      },
    });

    await store.upsertPageChunks("123", [
      {
        chunkId: "chunk-1",
        documentId: "page:123",
        pageId: "123",
        content: "release notes",
        metadata: {
          contentType: "page",
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
          tenantId: null,
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          bodyFormat: "storage",
        },
        embedding: [1, 0],
        updatedAt: "2026-04-09T08:00:00Z",
      },
    ]);

    expect(await store.count()).toBe(2);
    expect(query).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM "public"."semantic_chunks" WHERE page_id = $1',
      ["123"],
    );
  });
});
