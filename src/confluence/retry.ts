import type { Logger } from "../logging/logger.js";
import { ConfluenceClientError, ConfluenceRateLimitError } from "./errors.js";

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  logger?: Logger;
  operationName: string;
};

function jitter(delayMs: number): number {
  return Math.floor(delayMs / 2 + Math.random() * (delayMs / 2));
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function computeDelayMs(
  error: ConfluenceClientError,
  attempt: number,
  options: RetryOptions,
): number {
  if (error instanceof ConfluenceRateLimitError && error.retryAfterMs != null) {
    return Math.min(error.retryAfterMs, options.maxDelayMs ?? 10_000);
  }

  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const exponentialDelay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);

  return jitter(exponentialDelay);
}

export async function withConfluenceRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (
        !(error instanceof ConfluenceClientError) ||
        !error.isRetryable ||
        attempt >= maxAttempts
      ) {
        throw error;
      }

      const delayMs = computeDelayMs(error, attempt, options);
      options.logger?.warn("Retrying Confluence request", {
        operationName: options.operationName,
        attempt,
        maxAttempts,
        delayMs,
        errorName: error.name,
        status: error.status,
        url: error.url,
      });

      await wait(delayMs);
    }
  }
}
