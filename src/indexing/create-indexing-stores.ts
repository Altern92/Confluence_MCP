import { join } from "node:path";

import type { AppConfig } from "../config.js";
import { FileDocumentIndexStore } from "./file-document-index-store.js";
import { FileSyncStateStore } from "./file-sync-state-store.js";
import { InMemoryDocumentIndexStore } from "./index-store.js";
import { InMemorySyncStateStore } from "./sync-state-store.js";
import type { DocumentIndexStore, SyncStateStore } from "./storage-ports.js";

export type IndexingStores = {
  driver: "memory" | "file";
  storagePath: string | null;
  indexStore: DocumentIndexStore;
  syncStateStore: SyncStateStore;
};

export function createIndexingStores(config: AppConfig): IndexingStores {
  const driver = config.indexing?.storage?.driver ?? "memory";
  const storagePath = config.indexing?.storage?.path ?? ".data/indexing";

  if (driver === "file") {
    return {
      driver,
      storagePath,
      indexStore: new FileDocumentIndexStore(join(storagePath, "documents.json")),
      syncStateStore: new FileSyncStateStore(join(storagePath, "sync-state.json")),
    };
  }

  return {
    driver: "memory",
    storagePath: null,
    indexStore: new InMemoryDocumentIndexStore(),
    syncStateStore: new InMemorySyncStateStore(),
  };
}
