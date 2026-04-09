import type { AppConfig } from "../config.js";
import type { Logger } from "../logging/logger.js";
import { getRequestContext } from "../logging/request-context.js";
import { MetricsRegistry } from "../observability/metrics-registry.js";
import type { BodyFormat } from "../types/tool-schemas.js";
import { resolveRuntimeConfluenceAuth } from "./runtime-auth.js";
import type {
  ConfluenceContentRestrictionsResponse,
  ConfluencePageAttachmentsResponse,
  ConfluencePageAncestorsResponse,
  ConfluencePageDescendantsResponse,
  ConfluencePageResponse,
  ConfluenceSpacePagesResponse,
  ConfluenceSpacesResponse,
  ConfluenceSearchResponse,
} from "./types.js";
import { createConfluenceErrorFromResponse, createConfluenceErrorFromUnknown } from "./errors.js";
import { withConfluenceRetry } from "./retry.js";

type QueryValue = string | number | boolean | undefined;

type ConfluenceClientOptions = {
  config: AppConfig;
  logger?: Logger;
  metrics?: MetricsRegistry;
};

function extractRateLimitHeaders(headers: Headers) {
  const result = {
    limit: headers.get("x-ratelimit-limit"),
    remaining: headers.get("x-ratelimit-remaining"),
    nearLimit: headers.get("x-ratelimit-nearlimit"),
    reset: headers.get("x-ratelimit-reset"),
    retryAfter: headers.get("retry-after"),
  };

  return Object.values(result).some((value) => value != null) ? result : undefined;
}

export class ConfluenceClient {
  private readonly config: AppConfig;
  private readonly logger?: Logger;
  private readonly metrics?: MetricsRegistry;

  constructor(options: ConfluenceClientOptions | AppConfig) {
    if ("config" in options) {
      this.config = options.config;
      this.logger = options.logger;
      this.metrics = options.metrics;
      return;
    }

    this.config = options;
  }

  async search(cql: string, limit: number, cursor?: string): Promise<ConfluenceSearchResponse> {
    return this.requestJson<ConfluenceSearchResponse>("/wiki/rest/api/search", {
      cql,
      limit,
      cursor,
    });
  }

  async getSpaces(options: { limit: number; cursor?: string }): Promise<ConfluenceSpacesResponse> {
    return this.requestJson<ConfluenceSpacesResponse>("/wiki/api/v2/spaces", {
      limit: options.limit,
      cursor: options.cursor,
    });
  }

  async getSpacePages(
    spaceId: string,
    options: {
      limit: number;
      cursor?: string;
    },
  ): Promise<ConfluenceSpacePagesResponse> {
    return this.requestJson<ConfluenceSpacePagesResponse>(`/wiki/api/v2/spaces/${spaceId}/pages`, {
      limit: options.limit,
      cursor: options.cursor,
    });
  }

  async getPage(pageId: string, bodyFormat: BodyFormat): Promise<ConfluencePageResponse> {
    return this.requestJson<ConfluencePageResponse>(`/wiki/api/v2/pages/${pageId}`, {
      "body-format": bodyFormat,
    });
  }

  async getPageAncestors(pageId: string): Promise<ConfluencePageAncestorsResponse> {
    return this.requestJson<ConfluencePageAncestorsResponse>(
      `/wiki/api/v2/pages/${pageId}/ancestors`,
      {},
    );
  }

  async getPageDescendants(
    pageId: string,
    options: {
      limit: number;
      cursor?: string;
      depth?: number;
    },
  ): Promise<ConfluencePageDescendantsResponse> {
    return this.requestJson<ConfluencePageDescendantsResponse>(
      `/wiki/api/v2/pages/${pageId}/descendants`,
      {
        limit: options.limit,
        cursor: options.cursor,
        depth: options.depth,
      },
    );
  }

  async getPageRestrictions(pageId: string): Promise<ConfluenceContentRestrictionsResponse> {
    return this.requestJson<ConfluenceContentRestrictionsResponse>(
      `/wiki/rest/api/content/${pageId}/restriction/byOperation`,
      {},
    );
  }

  async getPageAttachments(
    pageId: string,
    options: {
      limit: number;
      cursor?: string;
      filename?: string;
      mediaType?: string;
    },
  ): Promise<ConfluencePageAttachmentsResponse> {
    return this.requestJson<ConfluencePageAttachmentsResponse>(
      `/wiki/api/v2/pages/${pageId}/attachments`,
      {
        limit: options.limit,
        cursor: options.cursor,
        filename: options.filename,
        mediaType: options.mediaType,
      },
    );
  }

  private async requestJson<T>(path: string, query: Record<string, QueryValue>): Promise<T> {
    const auth = resolveRuntimeConfluenceAuth(this.config);
    const url = new URL(path, `${auth.baseUrl}/`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return withConfluenceRetry(
      async () => {
        const startedAt = Date.now();
        const requestContext = getRequestContext();
        const requestId = requestContext?.requestId;
        const traceId = requestContext?.traceId;

        try {
          const response = await fetch(url, {
            headers: {
              Accept: "application/json",
              Authorization: `Basic ${this.buildBasicAuthToken(auth.email, auth.apiToken)}`,
              ...(requestId ? { "X-Request-Id": requestId } : {}),
              ...(traceId ? { "X-Trace-Id": traceId } : {}),
            },
            signal: AbortSignal.timeout(30000),
          });

          const latencyMs = Date.now() - startedAt;
          this.metrics?.recordConfluenceRequest({
            method: "GET",
            route: path,
            status: response.status,
            latencyMs,
            rateLimited: response.status === 429,
          });
          this.logger?.debug("Confluence request completed", {
            method: "GET",
            route: path,
            url: url.toString(),
            status: response.status,
            latencyMs,
            requestId,
            traceId,
            confluenceAuthMode: auth.mode,
            confluenceAuthSource: auth.source,
            confluenceAuthFingerprint: auth.fingerprint,
            rateLimitHeaders: extractRateLimitHeaders(response.headers),
          });

          if (!response.ok) {
            const responseBody = await response.text();
            throw createConfluenceErrorFromResponse(response, {
              method: "GET",
              url: url.toString(),
              responseBody,
            });
          }

          return (await response.json()) as T;
        } catch (error) {
          throw createConfluenceErrorFromUnknown(error, {
            method: "GET",
            url: url.toString(),
          });
        }
      },
      {
        operationName: `GET ${path}`,
        logger: this.logger,
      },
    );
  }

  private buildBasicAuthToken(email: string, apiToken: string): string {
    const rawToken = `${email}:${apiToken}`;
    return Buffer.from(rawToken, "utf8").toString("base64");
  }
}
