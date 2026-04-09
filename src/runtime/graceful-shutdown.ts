import type { Server as HttpServer } from "node:http";

import type { AppContext } from "../app/context.js";

type GracefulShutdownOptions = {
  beforeServerClose?: () => Promise<void> | void;
};

export function installGracefulShutdownHandlers(
  server: HttpServer,
  context: AppContext,
  options: GracefulShutdownOptions = {},
) {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    context.logger.info("Received shutdown signal", {
      signal,
    });

    try {
      await options.beforeServerClose?.();
    } catch (error) {
      context.logger.error("Failed to finish graceful shutdown pre-close tasks", {
        error,
      });
      process.exitCode = 1;
    }

    server.close((error) => {
      if (error) {
        context.logger.error("Failed to gracefully shut down HTTP server", {
          error,
        });
        process.exitCode = 1;
      } else {
        context.logger.info("HTTP server shut down gracefully");
      }

      process.exit();
    });
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
