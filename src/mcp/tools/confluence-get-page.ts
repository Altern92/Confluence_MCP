import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import {
  getPageInputShape,
  getPageOutputSchema,
  getPageOutputShape,
} from "../../types/tool-schemas.js";
import { executeTool } from "../execute-tool.js";

export function registerConfluenceGetPageTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.get_page",
    {
      title: "Get Confluence Page",
      description: "Fetch a single Confluence page body and metadata by pageId.",
      inputSchema: getPageInputShape,
      outputSchema: getPageOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.get_page",
        input,
        outputSchema: getPageOutputSchema,
        execute: () => context.contentService.getPage(input),
        buildBaseContext: () => ({
          scopeType: "page",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          pageId: output.pageId,
          bodyFormat: output.bodyFormat,
        }),
      });
    },
  );
}
