import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import {
  getPageRestrictionsInputShape,
  getPageRestrictionsOutputSchema,
  getPageRestrictionsOutputShape,
} from "../../types/tool-schemas.js";
import { executeTool } from "../execute-tool.js";

export function registerConfluenceGetPageRestrictionsTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.get_page_restrictions",
    {
      title: "Get Confluence Page Restrictions",
      description: "Fetch normalized Confluence page content restrictions by operation.",
      inputSchema: getPageRestrictionsInputShape,
      outputSchema: getPageRestrictionsOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.get_page_restrictions",
        input,
        outputSchema: getPageRestrictionsOutputSchema,
        execute: () => context.contentService.getPageRestrictions(input),
        buildBaseContext: () => ({
          scopeType: "page",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          pageId: output.pageId,
          operationCount: output.operations.length,
        }),
      });
    },
  );
}
