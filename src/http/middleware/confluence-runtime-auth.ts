import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import {
  extractRequestConfluenceAuth,
  type ConfluenceAccessLogContext,
} from "../../confluence/runtime-auth.js";
import { ConfluenceAuthError } from "../../confluence/errors.js";
import { setRequestContextConfluenceAuth } from "../../logging/request-context.js";
import { writeJsonRpcError } from "../jsonrpc.js";

function writeConfluenceAuthError(res: Response, message: string) {
  res.setHeader("WWW-Authenticate", 'Confluence realm="confluence-mcp"');
  writeJsonRpcError(res, 401, message, -32001);
}

export function createConfluenceRuntimeAuthMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = extractRequestConfluenceAuth(context.config, {
        authorization: req.headers["x-confluence-authorization"],
        email: req.headers["x-confluence-email"],
        apiToken: req.headers["x-confluence-api-token"],
        baseUrl: req.headers["x-confluence-base-url"],
      });

      setRequestContextConfluenceAuth({
        runtimeConfluenceAuth: parsed.auth,
        confluenceAccess: parsed.logContext,
      });

      res.locals.confluenceAccess = parsed.logContext;

      next();
    } catch (error) {
      if (error instanceof ConfluenceAuthError) {
        const logContext = {
          path: req.path,
          confluenceAccess:
            (res.locals.confluenceAccess as ConfluenceAccessLogContext | undefined) ?? null,
          status: error.status ?? 401,
          source: "runtime_confluence_auth",
        };

        context.logger.warn(
          "Rejected request with invalid Confluence runtime credentials",
          logContext,
        );
        writeConfluenceAuthError(res, error.message);
        return;
      }

      next(error);
    }
  };
}
