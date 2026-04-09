import { describe, expect, it } from "vitest";

import { buildIndexablePageSnapshot } from "../../src/indexing/page-snapshot.js";

describe("buildIndexablePageSnapshot", () => {
  it("builds an indexable page snapshot from page and ancestor data", () => {
    const snapshot = buildIndexablePageSnapshot({
      page: {
        pageId: "123",
        title: "Release Notes",
        status: "current",
        spaceId: "42",
        url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
        bodyFormat: "storage",
        body: "<p>Hello world</p>",
        version: {
          number: 7,
          createdAt: "2026-04-08T10:00:00Z",
        },
      },
      ancestors: [
        {
          pageId: "10",
          title: "Engineering",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/overview",
          depth: 1,
        },
        {
          pageId: "20",
          title: "Platform",
          spaceId: "42",
          url: "https://example.atlassian.net/spaces/ENG/pages/20/Platform",
          depth: 2,
        },
      ],
      spaceKey: "ENG",
      lastModified: "2026-04-08T10:00:00Z",
      tenantId: "tenant-a",
    });

    expect(snapshot).toEqual({
      contentType: "page",
      pageId: "123",
      title: "Release Notes",
      spaceKey: "ENG",
      ancestorIds: ["10", "20"],
      body: "<p>Hello world</p>",
      bodyFormat: "storage",
      lastModified: "2026-04-08T10:00:00Z",
      version: {
        number: 7,
        createdAt: "2026-04-08T10:00:00Z",
      },
      tenantId: "tenant-a",
      url: "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123",
    });
  });
});
