import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import {
  getPageDescendantsInputShape,
  getPageDescendantsOutputSchema,
  getPageDescendantsOutputShape,
} from "../../types/tool-schemas.js";
import { executeTool } from "../execute-tool.js";

export function registerConfluenceGetPageDescendantsTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.get_page_descendants",
    {
      title: "Get Confluence Page Descendants",
      description:
        "Fetch descendant content for a Confluence page using the v2 descendants endpoint.",
      inputSchema: getPageDescendantsInputShape,
      outputSchema: getPageDescendantsOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.get_page_descendants",
        input,
        outputSchema: getPageDescendantsOutputSchema,
        execute: () => context.contentService.getPageDescendants(input),
        buildBaseContext: () => ({
          scopeType: "page_tree",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          pageId: output.pageId,
          descendantCount: output.descendants.length,
          hasNextCursor: output.nextCursor != null,
        }),
      });
    },
  );
}
