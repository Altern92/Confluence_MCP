import type { EmbeddingService } from "./embedding-service.js";
import type { EmbeddingVector } from "./types.js";

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hashToken(token: string) {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeVector(vector: number[]): EmbeddingVector {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export class HashEmbeddingService implements EmbeddingService {
  readonly provider = "hash";

  constructor(readonly dimensions = 256) {}

  async embedText(text: string): Promise<EmbeddingVector> {
    const vector = new Array<number>(this.dimensions).fill(0);

    for (const token of tokenize(text)) {
      const hash = hashToken(token);
      const position = hash % this.dimensions;
      const sign = hash & 1 ? 1 : -1;

      vector[position] = (vector[position] ?? 0) + sign;
    }

    return normalizeVector(vector);
  }

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return Promise.all(texts.map((text) => this.embedText(text)));
  }
}
