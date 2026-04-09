import type { NextFunction, Request, Response } from "express";

import { describe, expect, it, vi } from "vitest";

import { createOriginPolicyMiddleware } from "../../src/http/middleware/origin-policy.js";
import { createTestContext } from "../integration/helpers.js";

function createMockResponse() {
  const response = {
    headersSent: false,
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response as unknown as Response;
}

describe("createOriginPolicyMiddleware", () => {
  it("allows requests when no origin allowlist is configured", () => {
    const next = vi.fn() as NextFunction;
    const middleware = createOriginPolicyMiddleware(createTestContext());

    middleware(
      {
        headers: {
          origin: "https://anything.example",
        },
      } as Request,
      createMockResponse(),
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects requests from origins outside the allowlist", () => {
    const baseContext = createTestContext();
    const next = vi.fn() as NextFunction;
    const response = createMockResponse();
    const middleware = createOriginPolicyMiddleware(
      createTestContext({
        config: {
          ...baseContext.config,
          server: {
            ...baseContext.config.server,
            allowedOrigins: ["https://chatgpt.com"],
          },
        },
      }),
    );

    middleware(
      {
        headers: {
          origin: "https://evil.example",
        },
      } as Request,
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Origin is not allowed.",
      },
      id: null,
    });
  });
});
