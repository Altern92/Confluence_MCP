import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { runWithRequestContext } from "../../logging/request-context.js";

export function createRequestContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incomingRequestId = req.headers["x-request-id"];
    const incomingTraceId = req.headers["x-trace-id"];
    const requestId =
      typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
        ? incomingRequestId.trim()
        : randomUUID();
    const traceId =
      typeof incomingTraceId === "string" && incomingTraceId.trim().length > 0
        ? incomingTraceId.trim()
        : randomUUID();

    runWithRequestContext({ requestId, traceId }, () => {
      res.locals.requestId = requestId;
      res.locals.traceId = traceId;
      res.setHeader("X-Request-Id", requestId);
      res.setHeader("X-Trace-Id", traceId);
      next();
    });
  };
}
