import { describe, expect, it } from "vitest";

import {
  buildFilterClauses,
  buildIncrementalSyncCql,
  buildPageTreeCql,
  buildScopeClause,
  buildSearchCql,
} from "../../src/confluence/cql.js";

describe("confluence/cql", () => {
  it("builds a page scope clause with a numeric page id", () => {
    expect(
      buildScopeClause({
        type: "page",
        pageId: "12345",
      }),
    ).toBe("id = 12345");
  });

  it("builds a page tree scope clause", () => {
    expect(
      buildScopeClause({
        type: "page_tree",
        pageId: "67890",
      }),
    ).toBe("ancestor = 67890");
  });

  it("builds a space scope clause with escaped quotes", () => {
    expect(
      buildScopeClause({
        type: "space",
        spaceKey: 'ENG-"CORE"',
      }),
    ).toBe('space = "ENG-\\"CORE\\""');
  });

  it("throws for a non-numeric page id", () => {
    expect(() =>
      buildScopeClause({
        type: "page",
        pageId: "abc",
      }),
    ).toThrow("pageId must be a numeric Confluence page ID.");
  });

  it("builds optional filters for updatedAfter and labels", () => {
    expect(
      buildFilterClauses({
        contentType: "page",
        updatedAfter: "2026-04-08T10:00:00Z",
        labels: ["release", 'team "alpha"'],
      }),
    ).toEqual([
      'lastmodified > "2026-04-08T10:00:00Z"',
      'label in ("release", "team \\"alpha\\"")',
    ]);
  });

  it("builds the full search CQL in a predictable order", () => {
    expect(
      buildSearchCql({
        query: 'release "notes"',
        scope: {
          type: "space",
          spaceKey: "ENG",
        },
        filters: {
          contentType: "page",
          updatedAfter: "2026-04-01",
          labels: ["release"],
        },
      }),
    ).toBe(
      'type = page AND space = "ENG" AND text ~ "release \\"notes\\"" AND lastmodified > "2026-04-01" AND label in ("release")',
    );
  });

  it("builds a page tree query from the root page id", () => {
    expect(buildPageTreeCql("111")).toBe("type = page AND ancestor = 111");
  });

  it("builds incremental sync CQL scoped to a space", () => {
    expect(
      buildIncrementalSyncCql({
        updatedAfter: "2026-04-08T10:00:00Z",
        spaceKey: "ENG",
      }),
    ).toBe('type = page AND space = "ENG" AND lastmodified > "2026-04-08T10:00:00Z"');
  });

  it("builds incremental sync CQL without a space filter for full polling", () => {
    expect(
      buildIncrementalSyncCql({
        updatedAfter: "2026-04-08T10:00:00Z",
      }),
    ).toBe('type = page AND lastmodified > "2026-04-08T10:00:00Z"');
  });
});
