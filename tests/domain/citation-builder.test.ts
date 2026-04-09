import { describe, expect, it } from "vitest";

import { buildKeywordProvenance } from "../../src/domain/citation-builder.js";

describe("buildKeywordProvenance", () => {
  it("builds keyword provenance objects for Confluence search results", () => {
    expect(buildKeywordProvenance('type = page AND space = "ENG"')).toEqual({
      source: "confluence_keyword",
      cql: 'type = page AND space = "ENG"',
    });
  });
});
