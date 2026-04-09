import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../../app/context.js";
import {
  getPageAttachmentsInputShape,
  getPageAttachmentsOutputSchema,
  getPageAttachmentsOutputShape,
} from "../../types/tool-schemas.js";
import { executeTool } from "../execute-tool.js";

export function registerConfluenceGetPageAttachmentsTool(server: McpServer, context: AppContext) {
  server.registerTool(
    "confluence.get_page_attachments",
    {
      title: "Get Confluence Page Attachments",
      description:
        "Fetch attachment metadata for a Confluence page using the v2 attachments endpoint.",
      inputSchema: getPageAttachmentsInputShape,
      outputSchema: getPageAttachmentsOutputShape,
    },
    async (input) => {
      return executeTool({
        context,
        toolName: "confluence.get_page_attachments",
        input,
        outputSchema: getPageAttachmentsOutputSchema,
        execute: () => context.contentService.getPageAttachments(input),
        buildBaseContext: () => ({
          scopeType: "page",
        }),
        buildSuccessContext: (_currentInput, output) => ({
          pageId: output.pageId,
          attachmentCount: output.attachments.length,
          hasNextCursor: output.nextCursor != null,
        }),
      });
    },
  );
}
