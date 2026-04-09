import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../app/context.js";
import { registerConfluenceTools } from "./register-tools.js";

export function createConfluenceMcpServer(context: AppContext) {
  const server = new McpServer({
    name: "confluence-mcp",
    version: "0.2.0",
  });

  registerConfluenceTools(server, context);

  return server;
}
