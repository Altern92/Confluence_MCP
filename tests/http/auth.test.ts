import { describe, expect, it } from "vitest";

import { resolveApiKeyAuth } from "../../src/http/middleware/auth.js";

describe("resolveApiKeyAuth", () => {
  it("prefers X-API-Key over Authorization: ApiKey", () => {
    const result = resolveApiKeyAuth("active-key", null, {
      authorization: "ApiKey wrong-key",
      apiKey: "active-key",
    });

    expect(result.isAuthorized).toBe(true);
    expect(result.context.source).toBe("x-api-key");
    expect(result.context.matchedSlot).toBe("active");
  });

  it("accepts the next key during rotation", () => {
    const result = resolveApiKeyAuth("active-key", "next-key", {
      apiKey: "next-key",
    });

    expect(result.isAuthorized).toBe(true);
    expect(result.context.matchedSlot).toBe("next");
    expect(result.context.fingerprint).toMatch(/^[a-f0-9]{12}$/);
  });

  it("returns unauthorized when a provided key does not match", () => {
    const result = resolveApiKeyAuth("active-key", "next-key", {
      apiKey: "wrong-key",
    });

    expect(result.isAuthorized).toBe(false);
    expect(result.context.provided).toBe(true);
    expect(result.context.fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(result.context.matchedSlot).toBeNull();
  });
});
