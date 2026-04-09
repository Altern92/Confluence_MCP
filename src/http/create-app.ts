import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";

import type { AppContext } from "../app/context.js";
import { buildSyncStatusSnapshot } from "../indexing/sync-status.js";
import { createConfluenceMcpServer } from "../mcp/create-server.js";
import { createApiKeyAuthMiddleware, resolveApiKeyAuth } from "./middleware/auth.js";
import { createHostPolicyMiddleware } from "./middleware/host-policy.js";
import { createOriginPolicyMiddleware } from "./middleware/origin-policy.js";
import { createRequestBodyLimitMiddleware } from "./middleware/request-body-limit.js";
import { createRequestContextMiddleware } from "./middleware/request-context.js";
import { createRequestLoggingMiddleware } from "./middleware/request-logging.js";
import { createRequestTimeoutMiddleware } from "./middleware/request-timeout.js";
import { writeJsonRpcError } from "./jsonrpc.js";

function authorizeInternalReadEndpoint(context: AppContext, req: Request) {
  return resolveApiKeyAuth(context.config.server.apiKey, context.config.server.nextApiKey, {
    authorization: req.headers.authorization,
    apiKey: typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined,
  });
}

export function createHttpApp(context: AppContext) {
  const app = createMcpExpressApp({
    host: context.config.server.host,
    allowedHosts:
      context.config.server.allowedHosts.length > 0
        ? context.config.server.allowedHosts
        : undefined,
  });

  app.use(createRequestContextMiddleware());
  app.use(createRequestLoggingMiddleware(context));

  app.use("/mcp", createRequestBodyLimitMiddleware(context));
  app.use("/mcp", createRequestTimeoutMiddleware(context));
  app.use("/mcp", createApiKeyAuthMiddleware(context));
  app.use("/mcp", createHostPolicyMiddleware(context));
  app.use("/mcp", createOriginPolicyMiddleware(context));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      transport: "http",
      mcpPath: "/mcp",
    });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    res.json({
      status: "ready",
      transport: "http",
      mcpPath: "/mcp",
    });
  });

  app.get("/metrics", (req: Request, res: Response) => {
    if (!context.config.app.metricsEnabled) {
      res.status(404).json({
        error: "Metrics are disabled.",
      });
      return;
    }

    const authResult = authorizeInternalReadEndpoint(context, req);

    res.locals.apiKeyAuth = authResult.context;

    if (!authResult.isAuthorized) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="confluence-mcp-metrics"');
      res.status(401).json({
        error: "Unauthorized.",
      });
      return;
    }

    res.json({
      environment: context.config.app.env,
      metrics: context.metrics.snapshot(),
    });
  });

  app.get("/sync-status", async (req: Request, res: Response) => {
    const authResult = authorizeInternalReadEndpoint(context, req);

    res.locals.apiKeyAuth = authResult.context;

    if (!authResult.isAuthorized) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="confluence-mcp-sync-status"');
      res.status(401).json({
        error: "Unauthorized.",
      });
      return;
    }

    res.json({
      environment: context.config.app.env,
      syncStatus: await buildSyncStatusSnapshot({
        config: context.config,
        stateStore: context.syncStateStore,
        indexStore: context.indexStore,
        worker: context.incrementalSyncWorker,
        vectorStore: context.vectorStore,
      }),
    });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createConfluenceMcpServer(context);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      context.logger.error("Error handling MCP HTTP request", { error });
      writeJsonRpcError(res, 500, "Internal server error.");
    } finally {
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    writeJsonRpcError(res, 405, "Method not allowed.");
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    writeJsonRpcError(res, 405, "Method not allowed.");
  });

  return app;
}
