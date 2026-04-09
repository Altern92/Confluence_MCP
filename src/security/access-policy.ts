import type { AppConfig } from "../config.js";
import type { SearchToolInput } from "../types/tool-schemas.js";

function normalizeSpaceKey(spaceKey: string) {
  return spaceKey.trim().toUpperCase();
}

function normalizePageId(pageId: string) {
  return pageId.trim();
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

export class AccessPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessPolicyError";
  }
}

export function getAllowedSpaceKeys(config: Pick<AppConfig, "policy">) {
  return dedupe((config.policy?.allowedSpaceKeys ?? []).map(normalizeSpaceKey).filter(Boolean));
}

export function getAllowedRootPageIds(config: Pick<AppConfig, "policy">) {
  return dedupe((config.policy?.allowedRootPageIds ?? []).map(normalizePageId).filter(Boolean));
}

export function assertSpaceAllowed(
  config: Pick<AppConfig, "policy">,
  spaceKey: string,
  action: string,
) {
  const allowedSpaceKeys = getAllowedSpaceKeys(config);

  if (allowedSpaceKeys.length === 0) {
    return;
  }

  if (!allowedSpaceKeys.includes(normalizeSpaceKey(spaceKey))) {
    throw new AccessPolicyError(
      `${action} is not allowed for space "${spaceKey}" because it is outside CONFLUENCE_ALLOWED_SPACE_KEYS.`,
    );
  }
}

export function assertRootPageAllowed(
  config: Pick<AppConfig, "policy">,
  pageId: string,
  action: string,
) {
  const allowedRootPageIds = getAllowedRootPageIds(config);

  if (allowedRootPageIds.length === 0) {
    return;
  }

  if (!allowedRootPageIds.includes(normalizePageId(pageId))) {
    throw new AccessPolicyError(
      `${action} is not allowed for page "${pageId}" because it is outside CONFLUENCE_ALLOWED_ROOT_PAGE_IDS.`,
    );
  }
}

export function assertSearchScopeAllowed(
  config: Pick<AppConfig, "policy">,
  scope: SearchToolInput["scope"],
) {
  if (scope.type === "space") {
    if (!scope.spaceKey) {
      throw new AccessPolicyError("Search scope is missing a spaceKey.");
    }

    assertSpaceAllowed(config, scope.spaceKey, "Search");
    return;
  }

  if (!scope.pageId) {
    throw new AccessPolicyError("Search scope is missing a pageId.");
  }

  assertRootPageAllowed(config, scope.pageId, "Search");
}

export function resolvePermittedSpaceKeys(
  config: Pick<AppConfig, "policy">,
  requestedSpaceKeys?: string[],
) {
  const allowedSpaceKeys = getAllowedSpaceKeys(config);
  const requested = dedupe((requestedSpaceKeys ?? []).map(normalizeSpaceKey).filter(Boolean));

  if (requested.length > 0) {
    for (const spaceKey of requested) {
      assertSpaceAllowed(config, spaceKey, "Requested sync");
    }

    return requested;
  }

  return allowedSpaceKeys.length > 0 ? allowedSpaceKeys : undefined;
}
