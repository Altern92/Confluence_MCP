import { describe, expect, it } from "vitest";

import { HashEmbeddingService } from "../../src/retrieval/hash-embedding-service.js";

describe("HashEmbeddingService", () => {
  it("produces deterministic normalized vectors", async () => {
    const service = new HashEmbeddingService(64);

    const first = await service.embedText("release notes deployment");
    const second = await service.embedText("release notes deployment");
    const magnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

    expect(first).toEqual(second);
    expect(first).toHaveLength(64);
    expect(magnitude).toBeCloseTo(1, 5);
  });
});
