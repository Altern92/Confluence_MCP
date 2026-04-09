import type { ScopeInput, SearchFiltersInput, SearchToolInput } from "../types/tool-schemas.js";

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function ensureNumericPageId(value: string, fieldName: string): string {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a numeric Confluence page ID.`);
  }

  return value;
}

export function buildScopeClause(scope: ScopeInput): string {
  switch (scope.type) {
    case "page":
      return `id = ${ensureNumericPageId(scope.pageId!, "pageId")}`;
    case "page_tree":
      return `ancestor = ${ensureNumericPageId(scope.pageId!, "pageId")}`;
    case "space":
      return `space = ${quote(scope.spaceKey!)}`;
  }
}

export function buildFilterClauses(filters?: SearchFiltersInput): string[] {
  if (!filters) {
    return [];
  }

  const clauses: string[] = [];

  if (filters.contentType && filters.contentType !== "page") {
    throw new Error("Only page contentType is supported in the starter implementation.");
  }

  if (filters.updatedAfter) {
    clauses.push(`lastmodified > ${quote(filters.updatedAfter)}`);
  }

  if (filters.labels && filters.labels.length > 0) {
    const labels = filters.labels.map((label) => quote(label)).join(", ");
    clauses.push(`label in (${labels})`);
  }

  return clauses;
}

export function buildSearchCql({
  query,
  scope,
  filters,
}: Pick<SearchToolInput, "query" | "scope" | "filters">): string {
  const clauses = [
    "type = page",
    buildScopeClause(scope),
    `text ~ ${quote(query)}`,
    ...buildFilterClauses(filters),
  ];

  return clauses.join(" AND ");
}

export function buildPageTreeCql(rootPageId: string): string {
  return `type = page AND ancestor = ${ensureNumericPageId(rootPageId, "rootPageId")}`;
}

export function buildIncrementalSyncCql(options: {
  updatedAfter: string;
  spaceKey?: string;
}): string {
  const clauses = ["type = page"];

  if (options.spaceKey) {
    clauses.push(`space = ${quote(options.spaceKey)}`);
  }

  clauses.push(`lastmodified > ${quote(options.updatedAfter)}`);

  return clauses.join(" AND ");
}
