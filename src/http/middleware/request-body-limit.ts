import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import { writeJsonRpcError } from "../jsonrpc.js";

export function createRequestBodyLimitMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLengthHeader = req.headers["content-length"];
    if (!contentLengthHeader) {
      next();
      return;
    }

    const contentLength = Number(contentLengthHeader);
    if (Number.isNaN(contentLength)) {
      writeJsonRpcError(res, 400, "Invalid Content-Length header.");
      return;
    }

    if (contentLength > context.config.server.maxRequestBodyBytes) {
      context.logger.warn("Rejected request that exceeded body size limit", {
        requestId: res.locals.requestId,
        contentLength,
        maxRequestBodyBytes: context.config.server.maxRequestBodyBytes,
        path: req.path,
      });
      writeJsonRpcError(res, 413, "Request body too large.");
      return;
    }

    next();
  };
}
