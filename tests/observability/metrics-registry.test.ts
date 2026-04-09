import { describe, expect, it } from "vitest";

import { MetricsRegistry } from "../../src/observability/metrics-registry.js";

describe("MetricsRegistry", () => {
  it("stores gauge metrics in snapshots", () => {
    const registry = new MetricsRegistry();

    registry.setGauge("sync_lag_seconds", 42, {
      scope: "space",
      spaceKey: "ENG",
    });

    expect(registry.snapshot().gauges).toEqual([
      {
        name: "sync_lag_seconds",
        tags: {
          scope: "space",
          spaceKey: "ENG",
        },
        value: 42,
      },
    ]);
  });

  it("overwrites the latest gauge value for the same metric identity", () => {
    const registry = new MetricsRegistry();

    registry.setGauge("sync_lag_seconds", 42, {
      scope: "space",
      spaceKey: "ENG",
    });
    registry.setGauge("sync_lag_seconds", 13, {
      scope: "space",
      spaceKey: "ENG",
    });

    expect(registry.snapshot().gauges).toEqual([
      {
        name: "sync_lag_seconds",
        tags: {
          scope: "space",
          spaceKey: "ENG",
        },
        value: 13,
      },
    ]);
  });

  it("records vector query counters and latency summaries", () => {
    const registry = new MetricsRegistry();

    registry.recordVectorQuery({
      requestMode: "hybrid",
      scopeType: "space",
      latencyMs: 17,
      resultCount: 4,
    });

    const snapshot = registry.snapshot();

    expect(snapshot.counters).toContainEqual({
      name: "vector_queries_total",
      tags: {
        requestMode: "hybrid",
        scopeType: "space",
      },
      value: 1,
    });
    expect(snapshot.summaries).toEqual(
      expect.arrayContaining([
        {
          name: "vector_query_latency_ms",
          tags: {
            requestMode: "hybrid",
            scopeType: "space",
          },
          count: 1,
          sum: 17,
          min: 17,
          max: 17,
          avg: 17,
        },
        {
          name: "vector_query_result_count",
          tags: {
            requestMode: "hybrid",
            scopeType: "space",
          },
          count: 1,
          sum: 4,
          min: 4,
          max: 4,
          avg: 4,
        },
      ]),
    );
  });

  it("records search verification counters", () => {
    const registry = new MetricsRegistry();

    registry.recordSearchVerification({
      requestMode: "hybrid",
      outcome: "verified",
    });
    registry.recordSearchVerification({
      requestMode: "hybrid",
      outcome: "dropped",
      reason: "forbidden",
    });

    expect(registry.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "search_verification_total",
          tags: {
            outcome: "verified",
            reason: "none",
            requestMode: "hybrid",
          },
          value: 1,
        },
        {
          name: "search_verification_total",
          tags: {
            outcome: "dropped",
            reason: "forbidden",
            requestMode: "hybrid",
          },
          value: 1,
        },
        {
          name: "verification_drop_total",
          tags: {
            reason: "forbidden",
            requestMode: "hybrid",
          },
          value: 1,
        },
      ]),
    );
  });
});
