import { htmlToText } from "../confluence/formatting.js";

const DEFAULT_MAX_SNIPPET_LENGTH = 220;
const MIN_QUERY_TERM_LENGTH = 3;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function tokenizeQuery(query: string | undefined | null) {
  if (!query) {
    return [];
  }

  return [
    ...new Set(
      (query.toLowerCase().match(/[a-z0-9]+/gi) ?? []).filter(
        (term) => term.length >= MIN_QUERY_TERM_LENGTH,
      ),
    ),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function trimToWordBoundary(value: string, fromStart: boolean) {
  if (!value) {
    return value;
  }

  if (fromStart) {
    const index = value.search(/\s/);
    return index === -1 ? value : value.slice(index + 1);
  }

  const reversedIndex = value.search(/\s(?=[^\s]*$)/);
  return reversedIndex === -1 ? value : value.slice(0, reversedIndex);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${trimToWordBoundary(value.slice(0, maxLength), false).trimEnd()}...`;
}

function sliceAroundMatch(value: string, matchIndex: number, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const halfWindow = Math.floor(maxLength / 2);
  const start = clamp(matchIndex - halfWindow, 0, Math.max(value.length - maxLength, 0));
  const end = Math.min(start + maxLength, value.length);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < value.length ? "..." : "";
  const sliced = value.slice(start, end);
  const leftTrimmed = start > 0 ? trimToWordBoundary(sliced, true) : sliced;
  const rightTrimmed = end < value.length ? trimToWordBoundary(leftTrimmed, false) : leftTrimmed;

  return `${prefix}${rightTrimmed.trim()}${suffix}`;
}

export function buildSearchSnippet(
  excerpt: string | undefined | null,
  fallbackTitle: string,
  query?: string | null,
) {
  const normalized = normalizeWhitespace(htmlToText(excerpt));

  if (!normalized) {
    return fallbackTitle;
  }

  const terms = tokenizeQuery(query);

  for (const term of terms) {
    const matchIndex = normalized.toLowerCase().indexOf(term);

    if (matchIndex >= 0) {
      return sliceAroundMatch(normalized, matchIndex, DEFAULT_MAX_SNIPPET_LENGTH);
    }
  }

  return truncateText(normalized, DEFAULT_MAX_SNIPPET_LENGTH);
}
