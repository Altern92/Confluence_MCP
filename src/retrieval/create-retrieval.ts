import { join } from "node:path";

import type { AppConfig } from "../config.js";
import { FileVectorStore } from "./file-vector-store.js";
import { HashEmbeddingService } from "./hash-embedding-service.js";
import { InMemoryVectorStore } from "./memory-vector-store.js";
import { PostgresVectorStore } from "./postgres-vector-store.js";
import { SemanticIndexer } from "./semantic-indexer.js";
import type { EmbeddingService } from "./embedding-service.js";
import type { VectorStore } from "./vector-store.js";

export type RetrievalComponents = {
  enabled: boolean;
  embeddingService: EmbeddingService | null;
  vectorStore: VectorStore | null;
  semanticIndexer: SemanticIndexer | null;
};

export function createRetrievalComponents(config: AppConfig): RetrievalComponents {
  const semanticConfig = config.indexing?.semantic;

  if (!semanticConfig?.enabled) {
    return {
      enabled: false,
      embeddingService: null,
      vectorStore: null,
      semanticIndexer: null,
    };
  }

  const embeddingService = new HashEmbeddingService(semanticConfig.embeddingDimensions);
  const vectorStore =
    semanticConfig.vectorStoreDriver === "file"
      ? new FileVectorStore(join(semanticConfig.vectorStorePath))
      : semanticConfig.vectorStoreDriver === "postgres"
        ? new PostgresVectorStore({
            connectionString: semanticConfig.postgres?.connectionString ?? "",
            schema: semanticConfig.postgres?.schema ?? "public",
            table: semanticConfig.postgres?.table ?? "confluence_semantic_chunks",
            dimensions: semanticConfig.embeddingDimensions,
            ssl: semanticConfig.postgres?.ssl ?? false,
            autoInit: semanticConfig.postgres?.autoInit ?? true,
          })
        : new InMemoryVectorStore();

  return {
    enabled: true,
    embeddingService,
    vectorStore,
    semanticIndexer: new SemanticIndexer(embeddingService, vectorStore),
  };
}
