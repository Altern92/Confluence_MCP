import { htmlToText } from "../confluence/formatting.js";
import type { IndexedDocumentChunk, IndexableConfluencePage } from "./types.js";

export type ChunkingOptions = {
  maxChars?: number;
  overlapChars?: number;
};

export type ExtractedSection = {
  sectionPath: string[];
  content: string;
};

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 150;
const TABLE_LINE_BREAK_TOKEN = "__TABLE_LINE_BREAK__";

function normalizeInlineHtml(html: string) {
  return htmlToText(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|pre|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- "),
  );
}

function extractTableRows(tableHtml: string) {
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: Array<Array<{ type: "th" | "td"; content: string }>> = [];

  for (const rowMatch of tableHtml.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells: Array<{ type: "th" | "td"; content: string }> = [];
    const cellRegex = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;

    for (const cellMatch of rowHtml.matchAll(cellRegex)) {
      const cellType = (cellMatch[1] ?? "td").toLowerCase() as "th" | "td";
      const content = normalizeInlineHtml(cellMatch[2] ?? "");

      if (!content) {
        continue;
      }

      cells.push({
        type: cellType,
        content,
      });
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

function normalizeTableHtml(tableHtml: string) {
  const rows = extractTableRows(tableHtml);

  if (rows.length === 0) {
    return "\n";
  }

  const headerRow = rows[0]?.every((cell) => cell.type === "th") ? rows[0] : null;
  const dataRows = headerRow ? rows.slice(1) : rows;
  const lines = ["Table:"];

  if (headerRow) {
    lines.push(`Headers: ${headerRow.map((cell) => cell.content).join(" | ")}`);
  }

  dataRows.forEach((row, index) => {
    if (headerRow) {
      const mappedCells = row.map((cell, cellIndex) => {
        const headerLabel = headerRow[cellIndex]?.content ?? `Column ${cellIndex + 1}`;
        return `${headerLabel} = ${cell.content}`;
      });

      lines.push(`Row ${index + 1}: ${mappedCells.join("; ")}`);
      return;
    }

    lines.push(`Row ${index + 1}: ${row.map((cell) => cell.content).join(" | ")}`);
  });

  return `${TABLE_LINE_BREAK_TOKEN}${lines.join(TABLE_LINE_BREAK_TOKEN)}${TABLE_LINE_BREAK_TOKEN}`;
}

function normalizeHtmlSegment(segment: string): string {
  const tableAwareSegment = segment.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) =>
    normalizeTableHtml(tableHtml),
  );

  return normalizeInlineHtml(tableAwareSegment)
    .replace(new RegExp(`\\s*${TABLE_LINE_BREAK_TOKEN}\\s*`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chooseChunkBoundary(content: string, start: number, tentativeEnd: number): number {
  if (tentativeEnd >= content.length) {
    return content.length;
  }

  const lowerBound = Math.max(start, tentativeEnd - Math.floor((tentativeEnd - start) * 0.25));
  const boundaryCandidates = ["\n\n", "\n", ". ", " "];

  for (const candidate of boundaryCandidates) {
    const index = content.lastIndexOf(candidate, tentativeEnd);

    if (index >= lowerBound) {
      return index + candidate.length;
    }
  }

  return tentativeEnd;
}

export function extractSectionsFromConfluenceBody(
  pageTitle: string,
  body: string,
): ExtractedSection[] {
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const sections: ExtractedSection[] = [];
  const headingStack: string[] = [];
  let currentPath = [pageTitle];
  let lastIndex = 0;
  let currentContent = "";

  const flushSection = () => {
    const normalizedContent = normalizeHtmlSegment(currentContent);

    if (!normalizedContent) {
      return;
    }

    sections.push({
      sectionPath: [...currentPath],
      content: normalizedContent,
    });
  };

  for (const match of body.matchAll(headingRegex)) {
    const [fullMatch, levelText, headingInnerHtml] = match;
    const level = Number(levelText);
    const matchIndex = match.index ?? 0;

    currentContent += body.slice(lastIndex, matchIndex);
    flushSection();

    const headingText = htmlToText(headingInnerHtml);

    if (headingText) {
      headingStack.length = Math.max(0, level - 1);
      headingStack[level - 1] = headingText;
      currentPath = [pageTitle, ...headingStack.filter(Boolean)];
    }

    currentContent = "";
    lastIndex = matchIndex + fullMatch.length;
  }

  currentContent += body.slice(lastIndex);
  flushSection();

  return sections;
}

export function splitSectionContentIntoChunks(
  content: string,
  options: ChunkingOptions = {},
): string[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, maxChars - 1);
  const normalizedContent = content.trim();

  if (normalizedContent.length === 0) {
    return [];
  }

  if (normalizedContent.length <= maxChars) {
    return [normalizedContent];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalizedContent.length) {
    const tentativeEnd = Math.min(start + maxChars, normalizedContent.length);
    const end = chooseChunkBoundary(normalizedContent, start, tentativeEnd);
    const chunk = normalizedContent.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= normalizedContent.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);

    while (start < normalizedContent.length && /\s/.test(normalizedContent[start] ?? "")) {
      start += 1;
    }
  }

  return chunks;
}

export function buildIndexedChunksFromPage(
  page: IndexableConfluencePage,
  options: ChunkingOptions = {},
): IndexedDocumentChunk[] {
  const sections = extractSectionsFromConfluenceBody(page.title, page.body);
  const documentId = `page:${page.pageId}`;
  let nextChunkIndex = 0;

  return sections.flatMap((section, sectionIndex) =>
    splitSectionContentIntoChunks(section.content, options).map((content) => {
      const chunkIndex = nextChunkIndex++;

      return {
        chunkId: `${documentId}:section-${sectionIndex}:chunk-${chunkIndex}`,
        documentId,
        chunkIndex,
        content,
        charCount: content.length,
        metadata: {
          contentType: page.contentType,
          pageId: page.pageId,
          pageTitle: page.title,
          spaceKey: page.spaceKey,
          ancestorIds: page.ancestorIds,
          sectionPath: section.sectionPath,
          lastModified: page.lastModified,
          version: page.version,
          tenantId: page.tenantId,
          url: page.url,
          bodyFormat: page.bodyFormat,
        },
      } satisfies IndexedDocumentChunk;
    }),
  );
}
