import { describe, expect, it } from "vitest";

import {
  AccessPolicyError,
  assertRootPageAllowed,
  assertSearchScopeAllowed,
  assertSpaceAllowed,
  getAllowedRootPageIds,
  getAllowedSpaceKeys,
  resolvePermittedSpaceKeys,
} from "../../src/security/access-policy.js";

describe("access policy", () => {
  const config = {
    policy: {
      allowedSpaceKeys: ["ENG", "ops", "ENG"],
      allowedRootPageIds: ["123", "456", "123"],
    },
  };

  it("normalizes and deduplicates configured space keys", () => {
    expect(getAllowedSpaceKeys(config)).toEqual(["ENG", "OPS"]);
  });

  it("normalizes and deduplicates configured root page ids", () => {
    expect(getAllowedRootPageIds(config)).toEqual(["123", "456"]);
  });

  it("allows configured spaces and rejects others", () => {
    expect(() => assertSpaceAllowed(config, "eng", "Search")).not.toThrow();
    expect(() => assertSpaceAllowed(config, "HR", "Search")).toThrow(AccessPolicyError);
  });

  it("allows configured root pages and rejects others", () => {
    expect(() => assertRootPageAllowed(config, "123", "Page tree lookup")).not.toThrow();
    expect(() => assertRootPageAllowed(config, "999", "Page tree lookup")).toThrow(
      AccessPolicyError,
    );
  });

  it("enforces search scopes against the configured allowlists", () => {
    expect(() =>
      assertSearchScopeAllowed(config, {
        type: "space",
        spaceKey: "ENG",
      }),
    ).not.toThrow();

    expect(() =>
      assertSearchScopeAllowed(config, {
        type: "page_tree",
        pageId: "999",
      }),
    ).toThrow(AccessPolicyError);
  });

  it("uses the configured allowlist when no explicit sync spaces are requested", () => {
    expect(resolvePermittedSpaceKeys(config)).toEqual(["ENG", "OPS"]);
  });

  it("validates explicitly requested sync spaces", () => {
    expect(resolvePermittedSpaceKeys(config, ["OPS"])).toEqual(["OPS"]);
    expect(() => resolvePermittedSpaceKeys(config, ["HR"])).toThrow(AccessPolicyError);
  });
});
