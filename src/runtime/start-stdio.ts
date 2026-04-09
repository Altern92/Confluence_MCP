import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { AppContext } from "../app/context.js";
import { createConfluenceMcpServer } from "../mcp/create-server.js";

export async function startStdioServer(context: AppContext) {
  const server = createConfluenceMcpServer(context);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  context.logger.info("Confluence MCP server is running", {
    transport: "stdio",
  });
}
