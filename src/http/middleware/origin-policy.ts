import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import { writeJsonRpcError } from "../jsonrpc.js";

function isAllowedOrigin(context: AppContext, originHeader: string | undefined): boolean {
  if (context.config.server.allowedOrigins.length === 0 || originHeader == null) {
    return true;
  }

  return context.config.server.allowedOrigins.includes(originHeader);
}

export function createOriginPolicyMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedOrigin(context, req.headers.origin)) {
      writeJsonRpcError(res, 403, "Origin is not allowed.");
      return;
    }

    next();
  };
}
