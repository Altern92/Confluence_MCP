import { createHash } from "node:crypto";

import type { AppConfig } from "../config.js";
import { ConfluenceAuthError } from "./errors.js";
import { getRequestContext } from "../logging/request-context.js";

export type ConfluenceRuntimeAuthMode = "service_account" | "prefer_user" | "require_user";

export type ConfluenceAccessSource =
  | "service_account"
  | "x-confluence-authorization"
  | "x-confluence-email-token";

export type ResolvedConfluenceAuth = {
  mode: "service_account" | "user";
  source: ConfluenceAccessSource;
  baseUrl: string;
  wikiBaseUrl: string;
  email: string;
  apiToken: string;
  fingerprint: string;
};

export type ConfluenceAccessLogContext = {
  mode: ResolvedConfluenceAuth["mode"];
  source: ConfluenceAccessSource;
  fingerprint: string;
  baseUrl: string;
};

type HeaderValue = string | string[] | undefined;

type ConfluenceAuthHeaders = {
  authorization?: HeaderValue;
  email?: HeaderValue;
  apiToken?: HeaderValue;
  baseUrl?: HeaderValue;
};

function getFirstHeaderValue(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function readTrimmedHeader(value: HeaderValue): string | undefined {
  const rawValue = getFirstHeaderValue(value);
  if (!rawValue) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveWikiBaseUrl(baseUrl: string) {
  return new URL("/wiki/", `${baseUrl}/`).toString().replace(/\/$/, "");
}

function createCredentialFingerprint(input: { baseUrl: string; email: string; apiToken: string }) {
  return createHash("sha256")
    .update(`${input.baseUrl}\n${input.email}\n${input.apiToken}`)
    .digest("hex")
    .slice(0, 12);
}

function createResolvedAuth(input: {
  mode: ResolvedConfluenceAuth["mode"];
  source: ConfluenceAccessSource;
  baseUrl: string;
  email: string;
  apiToken: string;
}): ResolvedConfluenceAuth {
  const normalizedBaseUrl = normalizeBaseUrl(input.baseUrl);

  return {
    mode: input.mode,
    source: input.source,
    baseUrl: normalizedBaseUrl,
    wikiBaseUrl: resolveWikiBaseUrl(normalizedBaseUrl),
    email: input.email,
    apiToken: input.apiToken,
    fingerprint: createCredentialFingerprint({
      baseUrl: normalizedBaseUrl,
      email: input.email,
      apiToken: input.apiToken,
    }),
  };
}

function toAccessLogContext(auth: ResolvedConfluenceAuth): ConfluenceAccessLogContext {
  return {
    mode: auth.mode,
    source: auth.source,
    fingerprint: auth.fingerprint,
    baseUrl: auth.baseUrl,
  };
}

function buildMalformedAuthError(message: string, config: AppConfig) {
  return new ConfluenceAuthError(message, {
    method: "GET",
    url: `${config.confluence.baseUrl}/wiki/rest/api/search`,
    status: 401,
  });
}

function decodeBasicCredentials(value: string, config: AppConfig) {
  const match = value.match(/^Basic\s+(.+)$/i);

  if (!match?.[1]) {
    throw buildMalformedAuthError("X-Confluence-Authorization must use the Basic scheme.", config);
  }

  let decoded: string;

  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    throw buildMalformedAuthError(
      "X-Confluence-Authorization contains invalid base64 data.",
      config,
    );
  }

  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex <= 0) {
    throw buildMalformedAuthError(
      "X-Confluence-Authorization must encode email:api_token.",
      config,
    );
  }

  const email = decoded.slice(0, separatorIndex).trim();
  const apiToken = decoded.slice(separatorIndex + 1).trim();

  if (email.length === 0 || apiToken.length === 0) {
    throw buildMalformedAuthError(
      "X-Confluence-Authorization must include both email and api token.",
      config,
    );
  }

  return {
    email,
    apiToken,
  };
}

function resolveRequestBaseUrl(
  configuredBaseUrl: string,
  requestedBaseUrl: string | undefined,
  config: AppConfig,
) {
  if (!requestedBaseUrl) {
    return configuredBaseUrl;
  }

  const normalizedConfiguredBaseUrl = normalizeBaseUrl(configuredBaseUrl);
  const normalizedRequestedBaseUrl = normalizeBaseUrl(requestedBaseUrl);

  if (!config.confluence.runtimeAuth?.allowBaseUrlOverride) {
    if (normalizedRequestedBaseUrl !== normalizedConfiguredBaseUrl) {
      throw buildMalformedAuthError(
        "X-Confluence-Base-Url must match the configured CONFLUENCE_BASE_URL.",
        config,
      );
    }

    return normalizedConfiguredBaseUrl;
  }

  return normalizedRequestedBaseUrl;
}

export function createServiceAccountConfluenceAuth(config: AppConfig): ResolvedConfluenceAuth {
  return createResolvedAuth({
    mode: "service_account",
    source: "service_account",
    baseUrl: config.confluence.baseUrl,
    email: config.confluence.email,
    apiToken: config.confluence.apiToken,
  });
}

export function extractRequestConfluenceAuth(
  config: AppConfig,
  headers: ConfluenceAuthHeaders,
): {
  auth: ResolvedConfluenceAuth | null;
  logContext: ConfluenceAccessLogContext | null;
} {
  const providedAuthorization = readTrimmedHeader(headers.authorization);
  const providedEmail = readTrimmedHeader(headers.email);
  const providedApiToken = readTrimmedHeader(headers.apiToken);
  const providedBaseUrl = readTrimmedHeader(headers.baseUrl);
  const hasAnyUserCredentialHeader =
    providedAuthorization != null ||
    providedEmail != null ||
    providedApiToken != null ||
    providedBaseUrl != null;

  if (!hasAnyUserCredentialHeader) {
    return {
      auth: null,
      logContext: null,
    };
  }

  if (providedAuthorization && (providedEmail || providedApiToken)) {
    throw buildMalformedAuthError(
      "Use either X-Confluence-Authorization or X-Confluence-Email plus X-Confluence-Api-Token, not both.",
      config,
    );
  }

  const baseUrl = resolveRequestBaseUrl(config.confluence.baseUrl, providedBaseUrl, config);

  if (providedAuthorization) {
    const credentials = decodeBasicCredentials(providedAuthorization, config);
    const auth = createResolvedAuth({
      mode: "user",
      source: "x-confluence-authorization",
      baseUrl,
      email: credentials.email,
      apiToken: credentials.apiToken,
    });

    return {
      auth,
      logContext: toAccessLogContext(auth),
    };
  }

  if ((providedEmail && !providedApiToken) || (!providedEmail && providedApiToken)) {
    throw buildMalformedAuthError(
      "X-Confluence-Email and X-Confluence-Api-Token must be provided together.",
      config,
    );
  }

  if (!providedEmail || !providedApiToken) {
    throw buildMalformedAuthError(
      "Confluence user credentials were not provided in a supported header format.",
      config,
    );
  }

  const auth = createResolvedAuth({
    mode: "user",
    source: "x-confluence-email-token",
    baseUrl,
    email: providedEmail,
    apiToken: providedApiToken,
  });

  return {
    auth,
    logContext: toAccessLogContext(auth),
  };
}

export function resolveRuntimeConfluenceAuth(config: AppConfig): ResolvedConfluenceAuth {
  const requestContext = getRequestContext();
  const requestAuth = requestContext?.runtimeConfluenceAuth ?? null;
  const runtimeAuthMode = config.confluence.runtimeAuth?.mode ?? "service_account";

  if (runtimeAuthMode === "service_account") {
    return createServiceAccountConfluenceAuth(config);
  }

  if (requestAuth) {
    return requestAuth;
  }

  if (requestContext && runtimeAuthMode === "require_user") {
    throw new ConfluenceAuthError(
      "Per-request Confluence credentials are required for runtime MCP requests.",
      {
        method: "GET",
        url: `${config.confluence.baseUrl}/wiki/rest/api/search`,
        status: 401,
      },
    );
  }

  return createServiceAccountConfluenceAuth(config);
}
