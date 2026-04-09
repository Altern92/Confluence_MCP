import { describe, expect, it } from "vitest";

import {
  buildIndexedChunksFromPage,
  extractSectionsFromConfluenceBody,
  splitSectionContentIntoChunks,
} from "../../src/indexing/chunking.js";

describe("indexing/chunking", () => {
  it("extracts heading-aware sections from Confluence storage HTML", () => {
    const sections = extractSectionsFromConfluenceBody(
      "Release Notes",
      [
        "<p>Overview intro</p>",
        "<h1>Installation</h1>",
        "<p>Install the service first.</p>",
        "<h2>Linux</h2>",
        "<p>Use apt-get install package.</p>",
      ].join(""),
    );

    expect(sections).toEqual([
      {
        sectionPath: ["Release Notes"],
        content: "Overview intro",
      },
      {
        sectionPath: ["Release Notes", "Installation"],
        content: "Install the service first.",
      },
      {
        sectionPath: ["Release Notes", "Installation", "Linux"],
        content: "Use apt-get install package.",
      },
    ]);
  });

  it("splits long section content into overlapping chunks", () => {
    const chunks = splitSectionContentIntoChunks(
      "A".repeat(80) + " " + "B".repeat(80) + " " + "C".repeat(80),
      {
        maxChars: 120,
        overlapChars: 20,
      },
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.length).toBeLessThanOrEqual(120);
    expect(chunks[1]?.length).toBeLessThanOrEqual(120);
  });

  it("builds indexed chunks with metadata and section paths", () => {
    const chunks = buildIndexedChunksFromPage(
      {
        contentType: "page",
        pageId: "123",
        title: "Release Notes",
        spaceKey: "ENG",
        ancestorIds: ["10", "20"],
        body: "<p>Overview intro</p><h1>Installation</h1><p>Install the service first.</p>",
        bodyFormat: "storage",
        lastModified: "2026-04-08T10:00:00Z",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
        tenantId: "tenant-a",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
      },
      {
        maxChars: 120,
        overlapChars: 20,
      },
    );

    expect(chunks).toEqual([
      {
        chunkId: "page:123:section-0:chunk-0",
        documentId: "page:123",
        chunkIndex: 0,
        content: "Overview intro",
        charCount: 14,
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
      },
      {
        chunkId: "page:123:section-1:chunk-1",
        documentId: "page:123",
        chunkIndex: 1,
        content: "Install the service first.",
        charCount: 26,
        metadata: {
          contentType: "page",
          pageId: "123",
          pageTitle: "Release Notes",
          spaceKey: "ENG",
          ancestorIds: ["10", "20"],
          sectionPath: ["Release Notes", "Installation"],
          lastModified: "2026-04-08T10:00:00Z",
          version: {
            number: 7,
            createdAt: "2026-04-08T10:00:00Z",
          },
          tenantId: "tenant-a",
          url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
          bodyFormat: "storage",
        },
      },
    ]);
  });

  it("normalizes Confluence tables into structured text rows", () => {
    const sections = extractSectionsFromConfluenceBody(
      "Runbook",
      [
        "<h1>Compatibility</h1>",
        "<table>",
        "<tr><th>Name</th><th>Status</th></tr>",
        "<tr><td>Service A</td><td>Ready</td></tr>",
        "<tr><td>Service B</td><td>Blocked</td></tr>",
        "</table>",
      ].join(""),
    );

    expect(sections).toEqual([
      {
        sectionPath: ["Runbook", "Compatibility"],
        content: [
          "Table:",
          "Headers: Name | Status",
          "Row 1: Name = Service A; Status = Ready",
          "Row 2: Name = Service B; Status = Blocked",
        ].join("\n"),
      },
    ]);
  });
});
