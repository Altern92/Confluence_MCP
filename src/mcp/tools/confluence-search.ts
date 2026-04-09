import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import { executeTool } from "../execute-tool.js";
import {
  searchInputShape,
  searchOutputSchema,
  searchOutputShape,
} from "../../types/tool-schemas.js";

export function registerConfluenceSearchTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.search",
    {
      title: "Search Confluence",
      description:
        "Search Confluence pages with strict page, page_tree, or space scoping. Returns ranked results with citations.",
      inputSchema: searchInputShape,
      outputSchema: searchOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.search",
        input,
        outputSchema: searchOutputSchema,
        execute: () => context.contentService.search(input),
        buildBaseContext: (currentInput) => ({
          scopeType: currentInput.scope.type,
          retrievalModeRequested: currentInput.retrieval?.mode ?? "keyword",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          resultCount: output.results.length,
          retrievalModeUsed: output.retrievalModeUsed,
          hasNextCursor: output.nextCursor != null,
        }),
      });
    },
  );
}
