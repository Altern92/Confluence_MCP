import type { AppContext } from "../app/context.js";
import { createHttpApp } from "../http/create-app.js";
import { installGracefulShutdownHandlers } from "./graceful-shutdown.js";

export async function startHttpServer(context: AppContext) {
  const app = createHttpApp(context);
  const httpServer = await new Promise<import("node:http").Server>((resolve, reject) => {
    const server = app.listen(
      context.config.server.port,
      context.config.server.host,
      (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        context.logger.info("Confluence MCP server is running", {
          appEnv: context.config.app.env,
          transport: "http",
          url: `http://${context.config.server.host}:${context.config.server.port}/mcp`,
          metricsUrl: context.config.app.metricsEnabled
            ? `http://${context.config.server.host}:${context.config.server.port}/metrics`
            : null,
        });
        resolve(server);
      },
    );

    server.on("error", reject);
  });

  context.incrementalSyncWorker.start();

  installGracefulShutdownHandlers(httpServer, context, {
    beforeServerClose: async () => {
      await context.incrementalSyncWorker.stop();
      await context.vectorStore?.close?.();
    },
  });
}
