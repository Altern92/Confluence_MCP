import type { NextFunction, Request, Response } from "express";

import { describe, expect, it, vi } from "vitest";

import { getRequestContext } from "../../src/logging/request-context.js";
import { createRequestContextMiddleware } from "../../src/http/middleware/request-context.js";

describe("createRequestContextMiddleware", () => {
  it("reuses incoming request and trace identifiers and exposes them to downstream handlers", () => {
    const middleware = createRequestContextMiddleware();
    const setHeader = vi.fn();
    let observedRequestId: string | undefined;
    let observedTraceId: string | undefined;

    const next = vi.fn(() => {
      observedRequestId = getRequestContext()?.requestId;
      observedTraceId = getRequestContext()?.traceId;
    }) as NextFunction;

    middleware(
      {
        headers: {
          "x-request-id": "incoming-req-123",
          "x-trace-id": "trace-abc-789",
        },
      } as Request,
      {
        locals: {},
        setHeader,
      } as unknown as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(observedRequestId).toBe("incoming-req-123");
    expect(observedTraceId).toBe("trace-abc-789");
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", "incoming-req-123");
    expect(setHeader).toHaveBeenCalledWith("X-Trace-Id", "trace-abc-789");
  });
});
