import {
  extractPageBody,
  mapAncestorResults,
  mapAttachmentResults,
  mapRestrictionOperations,
  resolvePageUrl,
} from "../confluence/formatting.js";
import { resolvePaginationInfo } from "../confluence/pagination.js";
import type {
  GetPageAncestorsToolInput,
  GetPageAncestorsToolOutput,
  GetPageAttachmentsToolInput,
  GetPageAttachmentsToolOutput,
  GetPageToolInput,
  GetPageToolOutput,
  GetPageRestrictionsToolInput,
  GetPageRestrictionsToolOutput,
} from "../types/tool-schemas.js";
import type { ConfluenceDomainServiceOptions } from "./confluence-domain-service-options.js";
import { ConfluencePageSpacePolicy } from "./confluence-page-space-policy.js";

export class ConfluencePageService {
  private readonly pageSpacePolicy: ConfluencePageSpacePolicy;

  constructor(private readonly options: ConfluenceDomainServiceOptions) {
    this.pageSpacePolicy = new ConfluencePageSpacePolicy(options.config, options.confluenceClient);
  }

  async getPage({ pageId, bodyFormat }: GetPageToolInput): Promise<GetPageToolOutput> {
    const page = await this.options.confluenceClient.getPage(pageId, bodyFormat);
    await this.pageSpacePolicy.assertResolvedPageAllowed(page, "Page lookup");

    return {
      pageId: String(page.id),
      title: page.title,
      status: page.status ?? null,
      spaceId: page.spaceId != null ? String(page.spaceId) : null,
      url: resolvePageUrl(this.options.config, String(page.id), page._links),
      bodyFormat,
      body: extractPageBody(page, bodyFormat),
      version: {
        number: page.version?.number ?? null,
        createdAt: page.version?.createdAt ?? null,
      },
    };
  }

  async getPageAncestors({
    pageId,
  }: GetPageAncestorsToolInput): Promise<GetPageAncestorsToolOutput> {
    await this.pageSpacePolicy.assertPageAllowed(pageId, "Page ancestors lookup");
    const response = await this.options.confluenceClient.getPageAncestors(pageId);

    return {
      pageId,
      ancestors: mapAncestorResults(response.results, this.options.config),
      nextCursor: resolvePaginationInfo({ links: response._links }).nextCursor,
    };
  }

  async getPageRestrictions({
    pageId,
  }: GetPageRestrictionsToolInput): Promise<GetPageRestrictionsToolOutput> {
    await this.pageSpacePolicy.assertPageAllowed(pageId, "Page restrictions lookup");
    const response = await this.options.confluenceClient.getPageRestrictions(pageId);

    return {
      pageId,
      operations: mapRestrictionOperations(response),
    };
  }

  async getPageAttachments({
    pageId,
    limit,
    cursor,
    filename,
    mediaType,
  }: GetPageAttachmentsToolInput): Promise<GetPageAttachmentsToolOutput> {
    await this.pageSpacePolicy.assertPageAllowed(pageId, "Page attachments lookup");
    const response = await this.options.confluenceClient.getPageAttachments(pageId, {
      limit,
      cursor,
      filename,
      mediaType,
    });

    return {
      pageId,
      attachments: mapAttachmentResults(response.results, this.options.config),
      nextCursor: resolvePaginationInfo({ links: response._links }).nextCursor,
    };
  }
}
