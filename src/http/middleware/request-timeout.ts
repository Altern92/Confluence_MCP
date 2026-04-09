import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import { writeJsonRpcError } from "../jsonrpc.js";

export function createRequestTimeoutMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(context.config.server.requestTimeoutMs, () => {
      context.logger.warn("Request timed out", {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        requestTimeoutMs: context.config.server.requestTimeoutMs,
      });

      if (!res.headersSent) {
        writeJsonRpcError(res, 408, "Request timed out.");
      }

      req.destroy();
    });

    next();
  };
}
