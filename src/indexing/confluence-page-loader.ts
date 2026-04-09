import type { BodyFormat } from "../types/tool-schemas.js";
import type { ConfluenceContentServicePort } from "../domain/confluence-content-service.js";
import type { GetPageAncestorsToolOutput, GetPageToolOutput } from "../types/tool-schemas.js";

export type LoadedPageForSync = {
  page: GetPageToolOutput;
  ancestors: GetPageAncestorsToolOutput["ancestors"];
  spaceKey: string | null;
  lastModified: string | null;
  tenantId: string | null;
};

export type LoadPageForSyncInput = {
  pageId: string;
  spaceKey?: string | null;
  tenantId?: string | null;
  bodyFormat?: BodyFormat;
};

export type PageLoaderPort = Pick<ConfluenceContentServicePort, "getPage" | "getPageAncestors">;

export class ConfluencePageLoader {
  constructor(private readonly contentService: PageLoaderPort) {}

  async loadPageForSync(input: LoadPageForSyncInput): Promise<LoadedPageForSync> {
    const bodyFormat = input.bodyFormat ?? "storage";

    const [page, ancestorsResult] = await Promise.all([
      this.contentService.getPage({
        pageId: input.pageId,
        bodyFormat,
      }),
      this.contentService.getPageAncestors({
        pageId: input.pageId,
      }),
    ]);

    return {
      page,
      ancestors: ancestorsResult.ancestors,
      spaceKey: input.spaceKey ?? null,
      lastModified: page.version.createdAt,
      tenantId: input.tenantId ?? null,
    };
  }
}
