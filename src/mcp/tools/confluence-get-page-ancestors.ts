import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import {
  getPageAncestorsInputShape,
  getPageAncestorsOutputSchema,
  getPageAncestorsOutputShape,
} from "../../types/tool-schemas.js";
import { executeTool } from "../execute-tool.js";

export function registerConfluenceGetPageAncestorsTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.get_page_ancestors",
    {
      title: "Get Confluence Page Ancestors",
      description: "Fetch ancestor pages for a Confluence page using the v2 ancestors endpoint.",
      inputSchema: getPageAncestorsInputShape,
      outputSchema: getPageAncestorsOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.get_page_ancestors",
        input,
        outputSchema: getPageAncestorsOutputSchema,
        execute: () => context.contentService.getPageAncestors(input),
        buildBaseContext: () => ({
          scopeType: "page_tree",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          pageId: output.pageId,
          ancestorCount: output.ancestors.length,
          hasNextCursor: output.nextCursor != null,
        }),
      });
    },
  );
}
