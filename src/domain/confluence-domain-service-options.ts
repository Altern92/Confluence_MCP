import type { AppConfig } from "../config.js";
import type { ConfluenceClient } from "../confluence/client.js";
import type { MetricsRegistry } from "../observability/metrics-registry.js";
import type { SemanticIndexer } from "../retrieval/semantic-indexer.js";

export type ConfluenceDomainServiceOptions = {
  config: AppConfig;
  confluenceClient: ConfluenceClient;
  metrics?: MetricsRegistry;
  semanticIndexer?: SemanticIndexer | null;
};
