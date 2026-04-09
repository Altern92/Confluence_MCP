import type { EmbeddingVector } from "./types.js";

export interface EmbeddingService {
  readonly provider: string;
  readonly dimensions: number;
  embedText(text: string): Promise<EmbeddingVector>;
  embedTexts(texts: string[]): Promise<EmbeddingVector[]>;
}
