import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../app/context.js";
import { registerConfluenceGetPageAttachmentsTool } from "./tools/confluence-get-page-attachments.js";
import { registerConfluenceGetPageAncestorsTool } from "./tools/confluence-get-page-ancestors.js";
import { registerConfluenceGetPageDescendantsTool } from "./tools/confluence-get-page-descendants.js";
import { registerConfluenceGetPageTool } from "./tools/confluence-get-page.js";
import { registerConfluenceGetPageRestrictionsTool } from "./tools/confluence-get-page-restrictions.js";
import { registerConfluenceGetPageTreeTool } from "./tools/confluence-get-page-tree.js";
import { registerConfluenceSearchTool } from "./tools/confluence-search.js";

export function registerConfluenceTools(server: McpServer, context: AppContext) {
  registerConfluenceSearchTool(server, context);
  registerConfluenceGetPageTool(server, context);
  registerConfluenceGetPageTreeTool(server, context);
  registerConfluenceGetPageAncestorsTool(server, context);
  registerConfluenceGetPageRestrictionsTool(server, context);
  registerConfluenceGetPageDescendantsTool(server, context);
  registerConfluenceGetPageAttachmentsTool(server, context);
}
