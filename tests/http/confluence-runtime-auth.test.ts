import type { NextFunction, Request, Response } from "express";

import { describe, expect, it, vi } from "vitest";

import { createConfluenceRuntimeAuthMiddleware } from "../../src/http/middleware/confluence-runtime-auth.js";
import { getRequestContext, runWithRequestContext } from "../../src/logging/request-context.js";
import { createTestContext } from "../integration/helpers.js";

function createMockResponse() {
  const response = {
    headersSent: false,
    locals: {},
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response as unknown as Response;
}

describe("createConfluenceRuntimeAuthMiddleware", () => {
  it("stores parsed user credentials in request context without exposing secrets", () => {
    const middleware = createConfluenceRuntimeAuthMiddleware(createTestContext());
    const response = createMockResponse();
    let observedContext = getRequestContext();
    const next = vi.fn(() => {
      observedContext = getRequestContext();
    }) as NextFunction;

    runWithRequestContext(
      {
        requestId: "req-1",
        traceId: "trace-1",
        confluenceAccess: null,
        runtimeConfluenceAuth: null,
      },
      () => {
        middleware(
          {
            path: "/mcp",
            headers: {
              "x-confluence-email": "person@example.com",
              "x-confluence-api-token": "user-token",
            },
          } as Request,
          response,
          next,
        );
      },
    );

    expect(next).toHaveBeenCalledOnce();
    expect(observedContext?.runtimeConfluenceAuth).toMatchObject({
      mode: "user",
      source: "x-confluence-email-token",
      baseUrl: "https://example.atlassian.net",
      wikiBaseUrl: "https://example.atlassian.net/wiki",
      email: "person@example.com",
      apiToken: "user-token",
    });
    expect(observedContext?.confluenceAccess).toMatchObject({
      mode: "user",
      source: "x-confluence-email-token",
    });
    expect(response.locals).toMatchObject({
      confluenceAccess: expect.objectContaining({
        mode: "user",
        source: "x-confluence-email-token",
      }),
    });
  });

  it("rejects malformed Confluence runtime auth headers", () => {
    const context = createTestContext();
    const middleware = createConfluenceRuntimeAuthMiddleware(context);
    const response = createMockResponse();
    const next = vi.fn() as NextFunction;

    runWithRequestContext(
      {
        requestId: "req-2",
        traceId: "trace-2",
        confluenceAccess: null,
        runtimeConfluenceAuth: null,
      },
      () => {
        middleware(
          {
            path: "/mcp",
            headers: {
              "x-confluence-email": "person@example.com",
            },
          } as Request,
          response,
          next,
        );
      },
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      'Confluence realm="confluence-mcp"',
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "X-Confluence-Email and X-Confluence-Api-Token must be provided together.",
      },
      id: null,
    });
  });
});
