import { describe, expect, it } from "vitest";

import {
  indexedChunkMetadataSchema,
  indexedDocumentChunkSchema,
  indexableConfluencePageSchema,
} from "../../src/indexing/types.js";

describe("indexing/types", () => {
  it("validates the source Confluence page schema", () => {
    const parsed = indexableConfluencePageSchema.parse({
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      ancestorIds: ["10", "20"],
      body: "<p>Hello</p>",
      bodyFormat: "storage",
      lastModified: "2026-04-08T10:00:00Z",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
      tenantId: "tenant-a",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
    });

    expect(parsed.contentType).toBe("page");
    expect(parsed.ancestorIds).toEqual(["10", "20"]);
  });

  it("validates indexed chunk metadata", () => {
    const parsed = indexedChunkMetadataSchema.parse({
      contentType: "page",
      pageId: "123",
      pageTitle: "Release Notes",
      spaceKey: "ENG",
      ancestorIds: ["10", "20"],
      sectionPath: ["Release Notes", "Install"],
      lastModified: "2026-04-08T10:00:00Z",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
      tenantId: "tenant-a",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      bodyFormat: "storage",
    });

    expect(parsed.sectionPath).toEqual(["Release Notes", "Install"]);
  });

  it("validates indexed chunk payloads", () => {
    const parsed = indexedDocumentChunkSchema.parse({
      chunkId: "page:123:section-0:chunk-0",
      documentId: "page:123",
      chunkIndex: 0,
      content: "Latest release notes for the service.",
      charCount: 37,
      metadata: {
        contentType: "page",
        pageId: "123",
        pageTitle: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: ["10", "20"],
        sectionPath: ["Release Notes"],
        lastModified: "2026-04-08T10:00:00Z",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
        tenantId: "tenant-a",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage",
      },
    });

    expect(parsed.chunkIndex).toBe(0);
    expect(parsed.charCount).toBe(37);
  });
});
