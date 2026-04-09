type MetricTags = Record<string, string | number | boolean | null | undefined>;

type CounterMetric = {
  name: string;
  tags: Record<string, string>;
  value: number;
};

type SummaryMetric = {
  name: string;
  tags: Record<string, string>;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
};

type GaugeMetric = {
  name: string;
  tags: Record<string, string>;
  value: number;
};

type MutableCounterMetric = CounterMetric;

type MutableSummaryMetric = Omit<SummaryMetric, "avg">;
type MutableGaugeMetric = GaugeMetric;

function normalizeTags(tags: MetricTags = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags)
      .filter(([, value]) => value != null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
}

function buildMetricKey(name: string, tags: Record<string, string>) {
  return `${name}:${JSON.stringify(tags)}`;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, MutableCounterMetric>();
  private readonly summaries = new Map<string, MutableSummaryMetric>();
  private readonly gauges = new Map<string, MutableGaugeMetric>();

  incrementCounter(name: string, tags: MetricTags = {}, value = 1) {
    const normalizedTags = normalizeTags(tags);
    const key = buildMetricKey(name, normalizedTags);
    const current = this.counters.get(key);

    if (current) {
      current.value += value;
      return;
    }

    this.counters.set(key, {
      name,
      tags: normalizedTags,
      value,
    });
  }

  observeSummary(name: string, value: number, tags: MetricTags = {}) {
    const normalizedTags = normalizeTags(tags);
    const key = buildMetricKey(name, normalizedTags);
    const current = this.summaries.get(key);

    if (current) {
      current.count += 1;
      current.sum += value;
      current.min = Math.min(current.min, value);
      current.max = Math.max(current.max, value);
      return;
    }

    this.summaries.set(key, {
      name,
      tags: normalizedTags,
      count: 1,
      sum: value,
      min: value,
      max: value,
    });
  }

  setGauge(name: string, value: number, tags: MetricTags = {}) {
    const normalizedTags = normalizeTags(tags);
    const key = buildMetricKey(name, normalizedTags);

    this.gauges.set(key, {
      name,
      tags: normalizedTags,
      value,
    });
  }

  recordHttpRequest(input: {
    method: string;
    path: string;
    statusCode: number;
    latencyMs: number;
  }) {
    this.incrementCounter("http_requests_total", {
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
    });
    this.observeSummary("http_request_latency_ms", input.latencyMs, {
      method: input.method,
      path: input.path,
    });
  }

  recordToolInvocation(input: {
    toolName: string;
    outcome: "success" | "error";
    durationMs: number;
    errorClass?: string;
  }) {
    this.incrementCounter("tool_invocations_total", {
      toolName: input.toolName,
      outcome: input.outcome,
      errorClass: input.errorClass ?? "none",
    });
    this.observeSummary("tool_latency_ms", input.durationMs, {
      toolName: input.toolName,
      outcome: input.outcome,
    });
  }

  recordConfluenceRequest(input: {
    method: string;
    route: string;
    status: number;
    latencyMs: number;
    rateLimited?: boolean;
  }) {
    this.incrementCounter("confluence_requests_total", {
      method: input.method,
      route: input.route,
      status: input.status,
    });
    this.observeSummary("confluence_request_latency_ms", input.latencyMs, {
      method: input.method,
      route: input.route,
    });

    if (input.rateLimited || input.status === 429) {
      this.incrementCounter("confluence_rate_limit_hits_total", {
        route: input.route,
      });
    }

    if (input.status === 401 || input.status === 403) {
      this.incrementCounter("permission_denials_total", {
        route: input.route,
        status: input.status,
      });
    }
  }

  recordVectorQuery(input: {
    requestMode: "semantic" | "hybrid";
    scopeType: "page" | "page_tree" | "space";
    latencyMs: number;
    resultCount: number;
  }) {
    this.incrementCounter("vector_queries_total", {
      requestMode: input.requestMode,
      scopeType: input.scopeType,
    });
    this.observeSummary("vector_query_latency_ms", input.latencyMs, {
      requestMode: input.requestMode,
      scopeType: input.scopeType,
    });
    this.observeSummary("vector_query_result_count", input.resultCount, {
      requestMode: input.requestMode,
      scopeType: input.scopeType,
    });
  }

  recordSearchVerification(input: {
    requestMode: "keyword" | "semantic" | "hybrid";
    outcome: "verified" | "dropped";
    reason?: "forbidden" | "notFound" | "error";
  }) {
    this.incrementCounter("search_verification_total", {
      requestMode: input.requestMode,
      outcome: input.outcome,
      reason: input.reason ?? "none",
    });

    if (input.outcome === "dropped" && input.reason) {
      this.incrementCounter("verification_drop_total", {
        requestMode: input.requestMode,
        reason: input.reason,
      });
    }
  }

  snapshot() {
    const counters = [...this.counters.values()]
      .map((metric) => ({
        ...metric,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const summaries = [...this.summaries.values()]
      .map((metric) => ({
        ...metric,
        avg: metric.count === 0 ? 0 : metric.sum / metric.count,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const gauges = [...this.gauges.values()]
      .map((metric) => ({
        ...metric,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      generatedAt: new Date().toISOString(),
      counters: counters as CounterMetric[],
      summaries: summaries as SummaryMetric[],
      gauges: gauges as GaugeMetric[],
    };
  }
}
