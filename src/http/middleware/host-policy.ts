import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import { writeJsonRpcError } from "../jsonrpc.js";

function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

function stripPort(value: string): string {
  const normalized = normalizeHost(value);

  if (normalized.startsWith("[")) {
    const closingBracketIndex = normalized.indexOf("]");
    return closingBracketIndex >= 0 ? normalized.slice(0, closingBracketIndex + 1) : normalized;
  }

  const colonIndex = normalized.indexOf(":");
  return colonIndex >= 0 ? normalized.slice(0, colonIndex) : normalized;
}

function extractRequestHost(hostHeader: string | undefined): string | null {
  if (!hostHeader) {
    return null;
  }

  return normalizeHost(hostHeader.split(",")[0] ?? hostHeader);
}

function isAllowedHost(context: AppContext, hostHeader: string | undefined): boolean {
  if (context.config.server.allowedHosts.length === 0) {
    return true;
  }

  const requestHost = extractRequestHost(hostHeader);
  if (!requestHost) {
    return false;
  }

  const requestHostWithoutPort = stripPort(requestHost);

  return context.config.server.allowedHosts.some((host) => {
    const configuredHost = normalizeHost(host);
    return configuredHost === requestHost || stripPort(configuredHost) === requestHostWithoutPort;
  });
}

export function createHostPolicyMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedHost(context, req.headers.host)) {
      writeJsonRpcError(res, 403, "Host is not allowed.");
      return;
    }

    next();
  };
}
