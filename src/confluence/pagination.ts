import type { ConfluenceLinks } from "./types.js";

type ResolvePaginationInfoOptions = {
  links?: ConfluenceLinks;
  linkHeader?: string | null;
};

type CollectPaginatedPagesOptions<TPage> = {
  fetchPage: (cursor?: string) => Promise<{
    page: TPage;
    nextCursor: string | null;
  }>;
  initialCursor?: string;
  maxPages?: number;
};

function toAbsoluteUrl(candidate: string): URL {
  return new URL(candidate.startsWith("http") ? candidate : `https://dummy.local${candidate}`);
}

export function extractNextCursor(nextLink?: string | null): string | null {
  if (!nextLink) {
    return null;
  }

  return toAbsoluteUrl(nextLink).searchParams.get("cursor");
}

export function extractNextLinkFromLinkHeader(linkHeader?: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const segment of linkHeader.split(",")) {
    const [rawUrlPart, ...parameterParts] = segment.split(";").map((part) => part.trim());
    const urlPart = rawUrlPart ?? "";
    const rel = parameterParts.find((part) => /^rel=/i.test(part));

    if (!rel || !/^rel="?next"?$/i.test(rel)) {
      continue;
    }

    const match = urlPart.match(/^<(.+)>$/);
    if (!match) {
      continue;
    }

    return match[1] ?? null;
  }

  return null;
}

export function resolvePaginationInfo(options: ResolvePaginationInfoOptions) {
  const nextLink = options.links?.next ?? extractNextLinkFromLinkHeader(options.linkHeader);

  return {
    nextLink: nextLink ?? null,
    nextCursor: extractNextCursor(nextLink),
  };
}

export async function collectPaginatedPages<TPage>(options: CollectPaginatedPagesOptions<TPage>) {
  const maxPages = options.maxPages ?? 50;
  const pages: TPage[] = [];
  let currentCursor = options.initialCursor;
  let nextCursor: string | null = null;
  const seenCursors = new Set<string>();

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (currentCursor && seenCursors.has(currentCursor)) {
      break;
    }

    if (currentCursor) {
      seenCursors.add(currentCursor);
    }

    const result = await options.fetchPage(currentCursor);
    pages.push(result.page);
    nextCursor = result.nextCursor;

    if (!nextCursor) {
      break;
    }

    currentCursor = nextCursor;
  }

  return {
    pages,
    nextCursor,
  };
}
