import { buildPageTreeCql } from "../confluence/cql.js";
import { mapPageDescendantResults } from "../confluence/formatting.js";
import { resolvePaginationInfo } from "../confluence/pagination.js";
import { assertRootPageAllowed } from "../security/access-policy.js";
import type {
  GetPageDescendantsToolInput,
  GetPageDescendantsToolOutput,
  GetPageTreeToolInput,
  GetPageTreeToolOutput,
} from "../types/tool-schemas.js";
import type { ConfluenceDomainServiceOptions } from "./confluence-domain-service-options.js";
import { ConfluencePageSpacePolicy } from "./confluence-page-space-policy.js";
import { mapSearchHitsToPageTreeResults } from "./search-result-mapper.js";

export class ConfluenceTreeService {
  private readonly pageSpacePolicy: ConfluencePageSpacePolicy;

  constructor(private readonly options: ConfluenceDomainServiceOptions) {
    this.pageSpacePolicy = new ConfluencePageSpacePolicy(options.config, options.confluenceClient);
  }

  async getPageTree({
    rootPageId,
    limit,
    cursor,
  }: GetPageTreeToolInput): Promise<GetPageTreeToolOutput> {
    assertRootPageAllowed(this.options.config, rootPageId, "Page tree lookup");
    await this.pageSpacePolicy.assertPageAllowed(rootPageId, "Page tree lookup");

    const cql = buildPageTreeCql(rootPageId);
    const response = await this.options.confluenceClient.search(cql, limit, cursor);

    return {
      rootPageId,
      descendants: mapSearchHitsToPageTreeResults(response.results, cql, this.options.config),
      nextCursor: resolvePaginationInfo({ links: response._links }).nextCursor,
    };
  }

  async getPageDescendants({
    pageId,
    limit,
    cursor,
    depth,
  }: GetPageDescendantsToolInput): Promise<GetPageDescendantsToolOutput> {
    assertRootPageAllowed(this.options.config, pageId, "Page descendants lookup");
    await this.pageSpacePolicy.assertPageAllowed(pageId, "Page descendants lookup");

    const response = await this.options.confluenceClient.getPageDescendants(pageId, {
      limit,
      cursor,
      depth,
    });

    return {
      pageId,
      descendants: mapPageDescendantResults(response.results, this.options.config),
      nextCursor: resolvePaginationInfo({ links: response._links }).nextCursor,
    };
  }
}
