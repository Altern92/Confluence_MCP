import * as z from "zod/v4";

import { describe, expect, it } from "vitest";

import { formatStartupError } from "../../src/runtime/startup.js";

describe("formatStartupError", () => {
  it("formats zod configuration errors into a readable startup message", () => {
    let error: unknown;

    try {
      z.object({
        CONFLUENCE_BASE_URL: z.string().url(),
      }).parse({
        CONFLUENCE_BASE_URL: "not-a-url",
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(formatStartupError(error)).toContain("Invalid environment configuration:");
    expect(formatStartupError(error)).toContain("CONFLUENCE_BASE_URL");
  });

  it("formats regular errors without leaking stack traces", () => {
    expect(formatStartupError(new Error("Boom"))).toBe(
      "Failed to start Confluence MCP server: Boom",
    );
  });
});
