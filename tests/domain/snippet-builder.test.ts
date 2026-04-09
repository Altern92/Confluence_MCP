import { describe, expect, it } from "vitest";

import { buildSearchSnippet } from "../../src/domain/snippet-builder.js";

describe("buildSearchSnippet", () => {
  it("turns Confluence HTML excerpts into plain text", () => {
    expect(buildSearchSnippet("<p>Hello&nbsp;<strong>team</strong></p>", "Fallback")).toBe(
      "Hello team",
    );
  });

  it("falls back to the title when excerpt text is empty", () => {
    expect(buildSearchSnippet("<p><br/></p>", "Release Notes")).toBe("Release Notes");
  });

  it("centers the snippet around query terms when they are present", () => {
    const snippet = buildSearchSnippet(
      "Intro text that is less relevant. The deployment checklist for release readiness lives here with rollback notes and validation steps. Additional trailing text that should not dominate the snippet.",
      "Release Notes",
      "deployment checklist",
    );

    expect(snippet.toLowerCase()).toContain("deployment checklist");
    expect(snippet.length).toBeLessThanOrEqual(223);
  });

  it("truncates long text when there is no query match", () => {
    const snippet = buildSearchSnippet("A".repeat(260), "Fallback", "missing terms");

    expect(snippet.endsWith("...")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(223);
  });
});
