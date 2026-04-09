import type {
  GetPageAncestorsToolInput,
  GetPageAncestorsToolOutput,
  GetPageAttachmentsToolInput,
  GetPageAttachmentsToolOutput,
  GetPageDescendantsToolInput,
  GetPageDescendantsToolOutput,
  GetPageToolInput,
  GetPageToolOutput,
  GetPageRestrictionsToolInput,
  GetPageRestrictionsToolOutput,
  GetPageTreeToolInput,
  GetPageTreeToolOutput,
  SearchToolInput,
  SearchToolOutput,
} from "../types/tool-schemas.js";
import type { ConfluenceDomainServiceOptions } from "./confluence-domain-service-options.js";
import { ConfluencePageService } from "./confluence-page-service.js";
import { ConfluenceSearchService } from "./confluence-search-service.js";
import { ConfluenceTreeService } from "./confluence-tree-service.js";

export class ConfluenceContentService {
  private readonly searchService: ConfluenceSearchService;
  private readonly pageService: ConfluencePageService;
  private readonly treeService: ConfluenceTreeService;

  constructor(options: ConfluenceDomainServiceOptions) {
    this.searchService = new ConfluenceSearchService(options);
    this.pageService = new ConfluencePageService(options);
    this.treeService = new ConfluenceTreeService(options);
  }

  async search(input: SearchToolInput): Promise<SearchToolOutput> {
    return this.searchService.search(input);
  }

  async getPage({ pageId, bodyFormat }: GetPageToolInput): Promise<GetPageToolOutput> {
    return this.pageService.getPage({ pageId, bodyFormat });
  }

  async getPageTree({
    rootPageId,
    limit,
    cursor,
  }: GetPageTreeToolInput): Promise<GetPageTreeToolOutput> {
    return this.treeService.getPageTree({ rootPageId, limit, cursor });
  }

  async getPageAncestors({
    pageId,
  }: GetPageAncestorsToolInput): Promise<GetPageAncestorsToolOutput> {
    return this.pageService.getPageAncestors({ pageId });
  }

  async getPageRestrictions({
    pageId,
  }: GetPageRestrictionsToolInput): Promise<GetPageRestrictionsToolOutput> {
    return this.pageService.getPageRestrictions({ pageId });
  }

  async getPageDescendants({
    pageId,
    limit,
    cursor,
    depth,
  }: GetPageDescendantsToolInput): Promise<GetPageDescendantsToolOutput> {
    return this.treeService.getPageDescendants({ pageId, limit, cursor, depth });
  }

  async getPageAttachments({
    pageId,
    limit,
    cursor,
    filename,
    mediaType,
  }: GetPageAttachmentsToolInput): Promise<GetPageAttachmentsToolOutput> {
    return this.pageService.getPageAttachments({
      pageId,
      limit,
      cursor,
      filename,
      mediaType,
    });
  }
}

export type ConfluenceContentServicePort = Pick<
  ConfluenceContentService,
  | "search"
  | "getPage"
  | "getPageTree"
  | "getPageAncestors"
  | "getPageRestrictions"
  | "getPageDescendants"
  | "getPageAttachments"
>;
