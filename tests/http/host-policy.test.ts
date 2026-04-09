import type { NextFunction, Request, Response } from "express";

import { describe, expect, it, vi } from "vitest";

import { createHostPolicyMiddleware } from "../../src/http/middleware/host-policy.js";
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

describe("createHostPolicyMiddleware", () => {
  it("allows requests when no host allowlist is configured", () => {
    const next = vi.fn() as NextFunction;
    const middleware = createHostPolicyMiddleware(createTestContext());

    middleware(
      {
        headers: {
          host: "localhost:3000",
        },
      } as Request,
      createMockResponse(),
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects requests whose host is not on the allowlist", () => {
    const baseContext = createTestContext();
    const next = vi.fn() as NextFunction;
    const response = createMockResponse();
    const middleware = createHostPolicyMiddleware(
      createTestContext({
        config: {
          ...baseContext.config,
          server: {
            ...baseContext.config.server,
            allowedHosts: ["chatgpt.example.com"],
          },
        },
      }),
    );

    middleware(
      {
        headers: {
          host: "evil.example.com",
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
        message: "Host is not allowed.",
      },
      id: null,
    });
  });
});
