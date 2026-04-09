import { createHash } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import type { AppContext } from "../../app/context.js";
import { writeJsonRpcError } from "../jsonrpc.js";

export type ApiKeyAuthHeader = "x-api-key" | "authorization";
export type ApiKeyMatchSlot = "active" | "next";

export type ApiKeyAuthContext = {
  provided: boolean;
  source: ApiKeyAuthHeader | null;
  fingerprint: string | null;
  matchedSlot: ApiKeyMatchSlot | null;
};

export type ApiKeyAuthResult = {
  isAuthorized: boolean;
  context: ApiKeyAuthContext;
};

function extractAuthorizationApiKey(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^ApiKey\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function createApiKeyFingerprint(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

function extractProvidedApiKey(headers: { authorization?: string; apiKey?: string }): {
  value: string | null;
  source: ApiKeyAuthHeader | null;
} {
  const providedApiKeyHeader = headers.apiKey?.trim();

  if (providedApiKeyHeader) {
    return {
      value: providedApiKeyHeader,
      source: "x-api-key",
    };
  }

  const providedAuthorizationKey = extractAuthorizationApiKey(headers.authorization);

  if (providedAuthorizationKey) {
    return {
      value: providedAuthorizationKey,
      source: "authorization",
    };
  }

  return {
    value: null,
    source: null,
  };
}

export function resolveApiKeyAuth(
  activeApiKey: string | null,
  nextApiKey: string | null,
  headers: {
    authorization?: string;
    apiKey?: string;
  },
): ApiKeyAuthResult {
  const provided = extractProvidedApiKey(headers);

  if (!activeApiKey && !nextApiKey) {
    return {
      isAuthorized: true,
      context: {
        provided: provided.value != null,
        source: provided.source,
        fingerprint: provided.value ? createApiKeyFingerprint(provided.value) : null,
        matchedSlot: null,
      },
    };
  }

  if (!provided.value) {
    return {
      isAuthorized: false,
      context: {
        provided: false,
        source: null,
        fingerprint: null,
        matchedSlot: null,
      },
    };
  }

  const matchedSlot =
    provided.value === activeApiKey ? "active" : provided.value === nextApiKey ? "next" : null;

  return {
    isAuthorized: matchedSlot != null,
    context: {
      provided: true,
      source: provided.source,
      fingerprint: createApiKeyFingerprint(provided.value),
      matchedSlot,
    },
  };
}

export function isValidApiKey(
  expectedApiKey: string | null,
  nextApiKey: string | null,
  headers: {
    authorization?: string;
    apiKey?: string;
  },
) {
  return resolveApiKeyAuth(expectedApiKey, nextApiKey, headers).isAuthorized;
}

export function createApiKeyAuthMiddleware(context: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authResult = resolveApiKeyAuth(
      context.config.server.apiKey,
      context.config.server.nextApiKey,
      {
        authorization: req.headers.authorization,
        apiKey: typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined,
      },
    );

    res.locals.apiKeyAuth = authResult.context;

    if (context.config.server.apiKey == null && context.config.server.nextApiKey == null) {
      next();
      return;
    }

    if (!authResult.isAuthorized) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="confluence-mcp"');
      writeJsonRpcError(res, 401, "Unauthorized.", -32001);
      return;
    }

    next();
  };
}
