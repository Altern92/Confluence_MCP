import type { GetPageAncestorsToolOutput, GetPageToolOutput } from "../types/tool-schemas.js";
import type { IndexableConfluencePage } from "./types.js";

export type BuildIndexablePageSnapshotInput = {
  page: GetPageToolOutput;
  ancestors?: GetPageAncestorsToolOutput["ancestors"];
  spaceKey: string | null;
  lastModified: string | null;
  tenantId?: string | null;
};

export function buildIndexablePageSnapshot({
  page,
  ancestors = [],
  spaceKey,
  lastModified,
  tenantId = null,
}: BuildIndexablePageSnapshotInput): IndexableConfluencePage {
  return {
    contentType: "page",
    pageId: page.pageId,
    title: page.title,
    spaceKey,
    ancestorIds: ancestors.map((ancestor) => ancestor.pageId),
    body: page.body,
    bodyFormat: page.bodyFormat,
    lastModified,
    version: page.version,
    tenantId,
    url: page.url,
  };
}
