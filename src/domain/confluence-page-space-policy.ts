import type { AppConfig } from "../config.js";
import type { ConfluenceClient } from "../confluence/client.js";
import {
  AccessPolicyError,
  getAllowedSpaceKeys,
  assertSpaceAllowed,
} from "../security/access-policy.js";

type PageMetadataPort = Pick<ConfluenceClient, "getPageMetadata" | "getSpaceById">;

type PageWithSpaceId = {
  id?: string | number;
  spaceId?: string | number;
};

export class ConfluencePageSpacePolicy {
  private readonly spaceKeyBySpaceId = new Map<string, string | null>();

  constructor(
    private readonly config: Pick<AppConfig, "policy">,
    private readonly client: PageMetadataPort,
  ) {}

  async assertPageAllowed(pageId: string, action: string) {
    if (!this.hasSpaceAllowlist()) {
      return;
    }

    const page = await this.client.getPageMetadata(pageId);
    await this.assertPageWithSpaceAllowed(page, pageId, action);
  }

  async assertResolvedPageAllowed(page: PageWithSpaceId, action: string) {
    if (!this.hasSpaceAllowlist()) {
      return;
    }

    const pageId = page.id != null ? String(page.id) : "unknown";
    await this.assertPageWithSpaceAllowed(page, pageId, action);
  }

  private hasSpaceAllowlist() {
    return getAllowedSpaceKeys(this.config).length > 0;
  }

  private async assertPageWithSpaceAllowed(page: PageWithSpaceId, pageId: string, action: string) {
    const spaceId = page.spaceId != null ? String(page.spaceId).trim() : "";

    if (!spaceId) {
      throw new AccessPolicyError(
        `${action} is not allowed for page "${pageId}" because its Confluence space could not be resolved.`,
      );
    }

    const spaceKey = await this.resolveSpaceKey(spaceId);

    if (!spaceKey) {
      throw new AccessPolicyError(
        `${action} is not allowed for page "${pageId}" because its Confluence space key could not be resolved.`,
      );
    }

    assertSpaceAllowed(this.config, spaceKey, action);
  }

  private async resolveSpaceKey(spaceId: string) {
    if (this.spaceKeyBySpaceId.has(spaceId)) {
      return this.spaceKeyBySpaceId.get(spaceId) ?? null;
    }

    const space = await this.client.getSpaceById(spaceId);
    const spaceKey = space.key?.trim() || null;
    this.spaceKeyBySpaceId.set(spaceId, spaceKey);

    return spaceKey;
  }
}
