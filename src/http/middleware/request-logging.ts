import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import type { ApiKeyAuthContext } from "./auth.js";
import type { ConfluenceAccessLogContext } from "../../confluence/runtime-auth.js";

export function createRequestLoggingMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const requestId = String(res.locals.requestId ?? "unknown");
    const traceId = String(res.locals.traceId ?? "unknown");

    context.logger.info("HTTP request started", {
      requestId,
      traceId,
      method: req.method,
      path: req.path,
      origin: req.headers.origin,
      userAgent: req.headers["user-agent"],
    });

    res.on("finish", () => {
      const latencyMs = Date.now() - startedAt;
      const apiKeyAuth = res.locals.apiKeyAuth as ApiKeyAuthContext | undefined;
      const confluenceAccess = res.locals.confluenceAccess as
        | ConfluenceAccessLogContext
        | undefined;

      context.metrics.recordHttpRequest({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs,
      });

      context.logger.info("HTTP request completed", {
        requestId,
        traceId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs,
        apiKeySource: apiKeyAuth?.source ?? null,
        apiKeyFingerprint: apiKeyAuth?.fingerprint ?? null,
        apiKeyMatchedSlot: apiKeyAuth?.matchedSlot ?? null,
        confluenceAuthMode: confluenceAccess?.mode ?? null,
        confluenceAuthSource: confluenceAccess?.source ?? null,
        confluenceAuthFingerprint: confluenceAccess?.fingerprint ?? null,
      });
    });

    next();
  };
}
