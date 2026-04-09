import { describe, expect, it } from "vitest";

import {
  collectPaginatedPages,
  extractNextCursor,
  extractNextLinkFromLinkHeader,
  resolvePaginationInfo,
} from "../../src/confluence/pagination.js";

describe("confluence/pagination", () => {
  it("extracts a cursor from a relative next link", () => {
    expect(extractNextCursor("/wiki/rest/api/search?cursor=abc123&limit=25")).toBe("abc123");
  });

  it("returns null when there is no next cursor", () => {
    expect(extractNextCursor()).toBeNull();
  });

  it("extracts the next link from an RFC5988 Link header", () => {
    expect(
      extractNextLinkFromLinkHeader(
        '<https://example.atlassian.net/wiki/api/v2/pages?cursor=next-123>; rel="next", <https://example.atlassian.net/wiki/api/v2/pages?cursor=prev-123>; rel="prev"',
      ),
    ).toBe("https://example.atlassian.net/wiki/api/v2/pages?cursor=next-123");
  });

  it("resolves pagination info from v1 body links", () => {
    expect(
      resolvePaginationInfo({
        links: {
          next: "/wiki/rest/api/search?cursor=body-cursor",
        },
      }),
    ).toEqual({
      nextLink: "/wiki/rest/api/search?cursor=body-cursor",
      nextCursor: "body-cursor",
    });
  });

  it("falls back to the v2 Link header when body links are absent", () => {
    expect(
      resolvePaginationInfo({
        linkHeader:
          '<https://example.atlassian.net/wiki/api/v2/pages?cursor=v2-cursor>; rel="next"',
      }),
    ).toEqual({
      nextLink: "https://example.atlassian.net/wiki/api/v2/pages?cursor=v2-cursor",
      nextCursor: "v2-cursor",
    });
  });

  it("collects paginated pages until no next cursor remains", async () => {
    const result = await collectPaginatedPages({
      async fetchPage(cursor) {
        if (!cursor) {
          return {
            page: { ids: ["1", "2"] },
            nextCursor: "next-1",
          };
        }

        if (cursor === "next-1") {
          return {
            page: { ids: ["3"] },
            nextCursor: null,
          };
        }

        throw new Error(`Unexpected cursor: ${cursor}`);
      },
    });

    expect(result).toEqual({
      pages: [{ ids: ["1", "2"] }, { ids: ["3"] }],
      nextCursor: null,
    });
  });
});
