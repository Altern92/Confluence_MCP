import { createAppContext } from "./app/context.js";
import { startHttpServer } from "./runtime/start-http.js";
import { startStdioServer } from "./runtime/start-stdio.js";
import { formatStartupError, logStartupSummary, logStartupWarnings } from "./runtime/startup.js";

async function main() {
  const context = createAppContext();
  logStartupSummary(context);
  logStartupWarnings(context);

  if (context.config.transport === "http") {
    await startHttpServer(context);
    return;
  }

  if (context.config.transport === "stdio") {
    await startStdioServer(context);
    return;
  }

  throw new Error(`Unsupported MCP transport: ${context.config.transport satisfies never}`);
}

main().catch((error) => {
  process.stderr.write(`${formatStartupError(error)}\n`);
  process.exit(1);
});
