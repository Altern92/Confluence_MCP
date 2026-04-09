import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import {
  getPageTreeInputShape,
  getPageTreeOutputSchema,
  getPageTreeOutputShape,
} from "../../types/tool-schemas.js";
import { executeTool } from "../execute-tool.js";

export function registerConfluenceGetPageTreeTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.get_page_tree",
    {
      title: "Get Confluence Page Tree",
      description: "List descendant pages for a root Confluence page using ancestor scoping.",
      inputSchema: getPageTreeInputShape,
      outputSchema: getPageTreeOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.get_page_tree",
        input,
        outputSchema: getPageTreeOutputSchema,
        execute: () => context.contentService.getPageTree(input),
        buildBaseContext: () => ({
          scopeType: "page_tree",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          rootPageId: output.rootPageId,
          descendantCount: output.descendants.length,
          hasNextCursor: output.nextCursor != null,
        }),
      });
    },
  );
}
