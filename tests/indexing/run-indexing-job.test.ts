import { describe, expect, it } from "vitest";

import { parseIndexingCliArgs } from "../../src/indexing/run-indexing-job.js";

describe("parseIndexingCliArgs", () => {
  it("parses status command with recent-runs override", () => {
    expect(parseIndexingCliArgs(["status", "--recent-runs=5"])).toEqual({
      type: "status",
      recentRuns: 5,
    });
  });

  it("parses full command with filters", () => {
    expect(
      parseIndexingCliArgs([
        "full",
        "--spaces=ENG,OPS",
        "--max-spaces=2",
        "--max-pages-per-space=25",
        "--reason=bootstrap",
      ]),
    ).toEqual({
      type: "full",
      reason: "bootstrap",
      tenantId: undefined,
      spaceKeys: ["ENG", "OPS"],
      maxSpaces: 2,
      maxPagesPerSpace: 25,
    });
  });

  it("parses space command", () => {
    expect(
      parseIndexingCliArgs([
        "space",
        "ENG",
        "--max-pages-per-space",
        "100",
        "--tenant-id=tenant-a",
      ]),
    ).toEqual({
      type: "space",
      reason: "manual",
      tenantId: "tenant-a",
      spaceKey: "ENG",
      maxPagesPerSpace: 100,
    });
  });

  it("parses page command", () => {
    expect(
      parseIndexingCliArgs([
        "page",
        "12345",
        "--space-key=ENG",
        "--body-format=atlas_doc_format",
        "--reason=retry",
      ]),
    ).toEqual({
      type: "page",
      reason: "retry",
      tenantId: undefined,
      pageId: "12345",
      spaceKey: "ENG",
      bodyFormat: "atlas_doc_format",
    });
  });

  it("rejects invalid command", () => {
    expect(() => parseIndexingCliArgs(["unknown"])).toThrow(
      "Unknown indexing command. Use one of: status, full, space, page.",
    );
  });

  it("rejects invalid page id", () => {
    expect(() => parseIndexingCliArgs(["page", "abc"])).toThrow(
      "page command requires a numeric page ID.",
    );
  });
});
