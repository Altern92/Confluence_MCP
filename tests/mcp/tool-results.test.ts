import * as z from "zod/v4";

import { describe, expect, it } from "vitest";

import { ConfluenceAuthError, ConfluenceRateLimitError } from "../../src/confluence/errors.js";
import { toToolError } from "../../src/mcp/tool-results.js";
import { AccessPolicyError } from "../../src/security/access-policy.js";

describe("toToolError", () => {
  it("maps Confluence auth errors to structured tool errors", () => {
    const result = toToolError(
      new ConfluenceAuthError("Auth failed", {
        method: "GET",
        url: "https://example.atlassian.net/wiki/rest/api/search",
        status: 401,
      }),
    );

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Confluence authentication failed.",
        },
      ],
      structuredContent: {
        errorClass: "confluence_auth",
        retryable: false,
        status: 401,
      },
    });
  });

  it("maps Confluence rate limit errors with retry metadata", () => {
    const result = toToolError(
      new ConfluenceRateLimitError("Rate limited", {
        method: "GET",
        url: "https://example.atlassian.net/wiki/rest/api/search",
        status: 429,
        retryAfterMs: 1500,
      }),
    );

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Confluence rate limit was reached. Please retry shortly.",
        },
      ],
      structuredContent: {
        errorClass: "confluence_rate_limit",
        retryable: true,
        status: 429,
        retryAfterMs: 1500,
      },
    });
  });

  it("maps input validation errors to structured issues", () => {
    let error: unknown;

    try {
      z.object({
        pageId: z.string().min(1),
      }).parse({
        pageId: "",
      });
    } catch (caughtError) {
      error = caughtError;
    }

    const result = toToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Tool input validation failed.",
      },
    ]);
    expect(result.structuredContent).toEqual({
      errorClass: "input_validation",
      retryable: false,
      issues: [
        {
          path: "pageId",
          message: "Too small: expected string to have >=1 characters",
        },
      ],
    });
  });

  it("maps access policy errors to forbidden structured tool errors", () => {
    const result = toToolError(
      new AccessPolicyError(
        'Search is not allowed for space "ENG" because it is outside CONFLUENCE_ALLOWED_SPACE_KEYS.',
      ),
    );

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: 'Search is not allowed for space "ENG" because it is outside CONFLUENCE_ALLOWED_SPACE_KEYS.',
        },
      ],
      structuredContent: {
        errorClass: "access_policy",
        retryable: false,
        status: 403,
      },
    });
  });
});
