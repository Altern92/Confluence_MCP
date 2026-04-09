import type { AppConfig } from "../config.js";
import type { BodyFormat } from "../types/tool-schemas.js";
import type {
  ConfluenceAttachment,
  ConfluenceAncestorPage,
  ConfluenceContentRestrictionsResponse,
  ConfluenceLinks,
  ConfluencePageResponse,
  ConfluencePageDescendant,
  ConfluenceRestrictionBucket,
  ConfluenceRestrictionOperation,
  ConfluenceRestrictionSubject,
} from "./types.js";

const htmlEntityMap: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeBasicHtmlEntities(value: string): string {
  let decoded = value;

  for (const [entity, replacement] of Object.entries(htmlEntityMap)) {
    decoded = decoded.replaceAll(entity, replacement);
  }

  return decoded;
}

export function htmlToText(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  return decodeBasicHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function resolveConfluenceUrlValue(
  config: AppConfig,
  explicitUrl?: string,
  baseUrl?: string,
): string | null {
  if (!explicitUrl) {
    return null;
  }

  try {
    return new URL(
      explicitUrl,
      ensureTrailingSlash(baseUrl ?? config.confluence.baseUrl),
    ).toString();
  } catch {
    return explicitUrl;
  }
}

export function resolvePageUrl(
  config: AppConfig,
  pageId: string,
  links?: ConfluenceLinks,
  explicitUrl?: string,
): string {
  if (explicitUrl) {
    try {
      return new URL(
        explicitUrl,
        ensureTrailingSlash(links?.base ?? config.confluence.baseUrl),
      ).toString();
    } catch {
      return new URL(
        `/wiki/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`,
        ensureTrailingSlash(config.confluence.baseUrl),
      ).toString();
    }
  }

  if (links?.base && links.webui) {
    return new URL(links.webui, ensureTrailingSlash(links.base)).toString();
  }

  if (links?.webui) {
    return new URL(links.webui, ensureTrailingSlash(config.confluence.wikiBaseUrl)).toString();
  }

  return new URL(
    `/wiki/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`,
    ensureTrailingSlash(config.confluence.baseUrl),
  ).toString();
}

export function extractPageBody(page: ConfluencePageResponse, bodyFormat: BodyFormat): string {
  const bodyContainer = page.body?.[bodyFormat];

  if (bodyContainer == null) {
    return "";
  }

  if (typeof bodyContainer === "string") {
    return bodyContainer;
  }

  if (typeof bodyContainer === "object" && bodyContainer !== null && "value" in bodyContainer) {
    const value = (bodyContainer as { value?: unknown }).value;

    if (typeof value === "string") {
      return value;
    }

    if (value !== undefined) {
      return JSON.stringify(value, null, 2);
    }
  }

  return JSON.stringify(bodyContainer, null, 2);
}

export function mapAncestorResults(
  results: ConfluenceAncestorPage[] | undefined,
  config: AppConfig,
) {
  return (results ?? []).map((ancestor, index) => {
    const pageId = String(ancestor.id ?? "");

    return {
      pageId,
      title: ancestor.title ?? `Page ${pageId}`,
      spaceId: ancestor.spaceId != null ? String(ancestor.spaceId) : null,
      url: resolvePageUrl(config, pageId, ancestor._links),
      depth: index + 1,
    };
  });
}

export function mapPageDescendantResults(
  results: ConfluencePageDescendant[] | undefined,
  config: AppConfig,
) {
  return (results ?? []).map((descendant) => {
    const pageId = String(descendant.id ?? "");
    const contentType = descendant.type ?? "unknown";

    return {
      pageId,
      title: descendant.title ?? `${contentType} ${pageId}`.trim(),
      contentType,
      status: descendant.status ?? null,
      parentId: descendant.parentId != null ? String(descendant.parentId) : null,
      depth: typeof descendant.depth === "number" ? descendant.depth : null,
      childPosition: typeof descendant.childPosition === "number" ? descendant.childPosition : null,
      url: contentType === "page" && pageId ? resolvePageUrl(config, pageId) : null,
    };
  });
}

function mapRestrictionSubjects(
  subjects: ConfluenceRestrictionSubject[] | undefined,
  type: "user" | "group",
) {
  return (subjects ?? []).map((subject) => ({
    type,
    identifier:
      subject.accountId ??
      (subject.id != null ? String(subject.id) : null) ??
      subject.username ??
      subject.name ??
      null,
    displayName: subject.displayName ?? subject.name ?? subject.username ?? null,
  }));
}

function extractRestrictionBucketResults(bucket: ConfluenceRestrictionBucket | undefined) {
  return bucket?.results ?? [];
}

function mapRestrictionOperation(
  operation: ConfluenceRestrictionOperation,
  fallbackOperation: string,
) {
  const restrictions = operation.restrictions;
  const userResults = extractRestrictionBucketResults(restrictions?.user ?? operation.user);
  const groupResults = extractRestrictionBucketResults(restrictions?.group ?? operation.group);

  return {
    operation: operation.operation ?? fallbackOperation,
    subjects: [
      ...mapRestrictionSubjects(userResults, "user"),
      ...mapRestrictionSubjects(groupResults, "group"),
    ],
  };
}

export function mapRestrictionOperations(response: ConfluenceContentRestrictionsResponse) {
  if (Array.isArray(response.results)) {
    return response.results.map((operation) =>
      mapRestrictionOperation(operation, operation.operation ?? "unknown"),
    );
  }

  return Object.entries(response)
    .filter(
      ([key, value]) => key !== "_links" && key !== "results" && value && typeof value === "object",
    )
    .map(([operation, value]) =>
      mapRestrictionOperation(value as ConfluenceRestrictionOperation, operation),
    );
}

export function mapAttachmentResults(
  results: ConfluenceAttachment[] | undefined,
  config: AppConfig,
) {
  return (results ?? []).map((attachment) => ({
    attachmentId: String(attachment.id ?? ""),
    title: attachment.title ?? "",
    status: attachment.status ?? null,
    mediaType: attachment.mediaType ?? null,
    mediaTypeDescription: attachment.mediaTypeDescription ?? null,
    comment: attachment.comment ?? null,
    fileId: attachment.fileId ?? null,
    fileSize: typeof attachment.fileSize === "number" ? attachment.fileSize : null,
    createdAt: attachment.createdAt ?? null,
    pageId: attachment.pageId != null ? String(attachment.pageId) : null,
    downloadUrl: resolveConfluenceUrlValue(
      config,
      attachment.downloadLink ?? attachment._links?.download,
      attachment._links?.base,
    ),
    webuiUrl: resolveConfluenceUrlValue(
      config,
      attachment.webuiLink ?? attachment._links?.webui,
      attachment._links?.base,
    ),
    version: {
      number: attachment.version?.number ?? null,
      createdAt: attachment.version?.createdAt ?? null,
      message: attachment.version?.message ?? null,
      minorEdit: attachment.version?.minorEdit ?? null,
      authorId: attachment.version?.authorId ?? null,
    },
  }));
}
