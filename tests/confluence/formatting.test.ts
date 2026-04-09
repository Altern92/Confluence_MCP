import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../src/config.js";
import {
  mapAttachmentResults,
  extractPageBody,
  htmlToText,
  mapAncestorResults,
  mapPageDescendantResults,
  mapRestrictionOperations,
  resolvePageUrl,
} from "../../src/confluence/formatting.js";
import { extractNextCursor } from "../../src/confluence/pagination.js";

const config: AppConfig = {
  app: {
    env: "test",
    metricsEnabled: true,
  },
  transport: "http",
  server: {
    host: "127.0.0.1",
    port: 3000,
    allowedHosts: [],
    allowedHostsSource: "configured",
    allowedOrigins: [],
    apiKey: null,
    nextApiKey: null,
    maxRequestBodyBytes: 256 * 1024,
    requestTimeoutMs: 30_000,
  },
  confluence: {
    baseUrl: "https://example.atlassian.net",
    wikiBaseUrl: "https://example.atlassian.net/wiki",
    email: "user@example.com",
    apiToken: "token",
  },
  defaults: {
    topK: 10,
  },
  logLevel: "info",
};

describe("confluence/formatting", () => {
  it("converts basic HTML to readable text", () => {
    expect(htmlToText("<p>Hello&nbsp;<strong>team</strong><br/>Line 2</p>")).toBe(
      "Hello team Line 2",
    );
  });

  it("extracts a cursor from a relative next link", () => {
    expect(extractNextCursor("/wiki/rest/api/search?cursor=abc123&limit=25")).toBe("abc123");
  });

  it("returns null when there is no next cursor", () => {
    expect(extractNextCursor()).toBeNull();
  });

  it("prefers an explicit absolute URL when provided", () => {
    expect(
      resolvePageUrl(
        config,
        "123",
        {
          webui: "/spaces/ENG/pages/123/Test",
        },
        "https://custom.example.com/page/123",
      ),
    ).toBe("https://custom.example.com/page/123");
  });

  it("resolves an explicit relative URL against the Confluence base URL", () => {
    expect(
      resolvePageUrl(
        config,
        "123",
        {
          base: "https://example.atlassian.net/wiki",
        },
        "/spaces/ENG/pages/123/Test",
      ),
    ).toBe("https://example.atlassian.net/spaces/ENG/pages/123/Test");
  });

  it("builds a page URL from base and webui links", () => {
    expect(
      resolvePageUrl(config, "123", {
        base: "https://example.atlassian.net",
        webui: "/wiki/spaces/ENG/pages/123/Test",
      }),
    ).toBe("https://example.atlassian.net/wiki/spaces/ENG/pages/123/Test");
  });

  it("falls back to a default Confluence viewpage URL", () => {
    expect(resolvePageUrl(config, "123")).toBe(
      "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
    );
  });

  it("extracts a string page body from storage body format", () => {
    expect(
      extractPageBody(
        {
          id: "123",
          title: "Page",
          body: {
            storage: {
              value: "<p>Hello</p>",
            },
          },
        },
        "storage",
      ),
    ).toBe("<p>Hello</p>");
  });

  it("maps ancestor results into normalized page entries", () => {
    expect(
      mapAncestorResults(
        [
          {
            id: "10",
            title: "Engineering",
            spaceId: "42",
            _links: {
              webui: "/spaces/ENG/overview",
            },
          },
          {
            id: "20",
            title: "Release Planning",
            spaceId: "42",
            _links: {
              webui: "/spaces/ENG/pages/20/Release+Planning",
            },
          },
        ],
        config,
      ),
    ).toEqual([
      {
        pageId: "10",
        title: "Engineering",
        spaceId: "42",
        url: "https://example.atlassian.net/spaces/ENG/overview",
        depth: 1,
      },
      {
        pageId: "20",
        title: "Release Planning",
        spaceId: "42",
        url: "https://example.atlassian.net/spaces/ENG/pages/20/Release+Planning",
        depth: 2,
      },
    ]);
  });

  it("normalizes restriction operations from byOperation payloads", () => {
    expect(
      mapRestrictionOperations({
        read: {
          operation: "read",
          restrictions: {
            user: {
              results: [
                {
                  accountId: "abc-123",
                  displayName: "Ada Lovelace",
                },
              ],
            },
            group: {
              results: [
                {
                  name: "eng-managers",
                  displayName: "Engineering Managers",
                },
              ],
            },
          },
        },
        update: {
          operation: "update",
          restrictions: {
            user: {
              results: [],
            },
          },
        },
      }),
    ).toEqual([
      {
        operation: "read",
        subjects: [
          {
            type: "user",
            identifier: "abc-123",
            displayName: "Ada Lovelace",
          },
          {
            type: "group",
            identifier: "eng-managers",
            displayName: "Engineering Managers",
          },
        ],
      },
      {
        operation: "update",
        subjects: [],
      },
    ]);
  });

  it("maps v2 page descendants into normalized output", () => {
    expect(
      mapPageDescendantResults(
        [
          {
            id: "124",
            title: "Child Page",
            type: "page",
            status: "current",
            parentId: "123",
            depth: 1,
            childPosition: 10,
          },
          {
            id: "125",
            title: "Architecture Folder",
            type: "folder",
            status: "current",
            parentId: "123",
            depth: 1,
            childPosition: 11,
          },
        ],
        config,
      ),
    ).toEqual([
      {
        pageId: "124",
        title: "Child Page",
        contentType: "page",
        status: "current",
        parentId: "123",
        depth: 1,
        childPosition: 10,
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124",
      },
      {
        pageId: "125",
        title: "Architecture Folder",
        contentType: "folder",
        status: "current",
        parentId: "123",
        depth: 1,
        childPosition: 11,
        url: null,
      },
    ]);
  });

  it("maps page attachment metadata into normalized output", () => {
    expect(
      mapAttachmentResults(
        [
          {
            id: "900",
            title: "release-notes.pdf",
            status: "current",
            mediaType: "application/pdf",
            mediaTypeDescription: "PDF document",
            comment: "Latest release notes",
            fileId: "file-900",
            fileSize: 2048,
            createdAt: "2026-04-08T10:00:00Z",
            pageId: "123",
            downloadLink: "/wiki/download/attachments/123/release-notes.pdf",
            webuiLink: "/wiki/spaces/ENG/pages/123/Release+Notes",
            version: {
              number: 3,
              createdAt: "2026-04-08T10:00:00Z",
              message: "Updated attachment",
              minorEdit: false,
              authorId: "abc-123",
            },
          },
        ],
        config,
      ),
    ).toEqual([
      {
        attachmentId: "900",
        title: "release-notes.pdf",
        status: "current",
        mediaType: "application/pdf",
        mediaTypeDescription: "PDF document",
        comment: "Latest release notes",
        fileId: "file-900",
        fileSize: 2048,
        createdAt: "2026-04-08T10:00:00Z",
        pageId: "123",
        downloadUrl:
          "https://example.atlassian.net/wiki/download/attachments/123/release-notes.pdf",
        webuiUrl: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
        version: {
          number: 3,
          createdAt: "2026-04-08T10:00:00Z",
          message: "Updated attachment",
          minorEdit: false,
          authorId: "abc-123",
        },
      },
    ]);
  });
});
