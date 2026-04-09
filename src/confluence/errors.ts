function parseRetryAfterToMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null;
  }

  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(retryAfterHeader);
  if (Number.isNaN(retryDate)) {
    return null;
  }

  return Math.max(0, retryDate - Date.now());
}

export type ConfluenceErrorContext = {
  method: string;
  url: string;
  status?: number;
  responseBody?: string;
  retryAfterMs?: number | null;
  cause?: unknown;
};

export class ConfluenceClientError extends Error {
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly responseBody?: string;
  readonly retryAfterMs?: number | null;
  readonly isRetryable: boolean;

  constructor(message: string, context: ConfluenceErrorContext, isRetryable = false) {
    super(message, context.cause ? { cause: context.cause } : undefined);
    this.name = "ConfluenceClientError";
    this.method = context.method;
    this.url = context.url;
    this.status = context.status;
    this.responseBody = context.responseBody;
    this.retryAfterMs = context.retryAfterMs ?? null;
    this.isRetryable = isRetryable;
  }
}

export class ConfluenceAuthError extends ConfluenceClientError {
  constructor(message: string, context: ConfluenceErrorContext) {
    super(message, context, false);
    this.name = "ConfluenceAuthError";
  }
}

export class ConfluenceForbiddenError extends ConfluenceClientError {
  constructor(message: string, context: ConfluenceErrorContext) {
    super(message, context, false);
    this.name = "ConfluenceForbiddenError";
  }
}

export class ConfluenceRateLimitError extends ConfluenceClientError {
  constructor(message: string, context: ConfluenceErrorContext) {
    super(message, context, true);
    this.name = "ConfluenceRateLimitError";
  }
}

export class ConfluenceTransientError extends ConfluenceClientError {
  constructor(message: string, context: ConfluenceErrorContext) {
    super(message, context, true);
    this.name = "ConfluenceTransientError";
  }
}

export class ConfluenceValidationError extends ConfluenceClientError {
  constructor(message: string, context: ConfluenceErrorContext) {
    super(message, context, false);
    this.name = "ConfluenceValidationError";
  }
}

export function createConfluenceErrorFromResponse(
  response: Response,
  context: Omit<ConfluenceErrorContext, "status" | "retryAfterMs"> & {
    responseBody: string;
  },
) {
  const errorContext: ConfluenceErrorContext = {
    ...context,
    status: response.status,
    retryAfterMs: parseRetryAfterToMs(response.headers.get("retry-after")),
  };
  const message = `Confluence API request failed with ${response.status} ${response.statusText}.`;

  if (response.status === 401) {
    return new ConfluenceAuthError(message, errorContext);
  }

  if (response.status === 403) {
    return new ConfluenceForbiddenError(message, errorContext);
  }

  if (response.status === 429) {
    return new ConfluenceRateLimitError(message, errorContext);
  }

  if (response.status === 408 || response.status === 425 || response.status >= 500) {
    return new ConfluenceTransientError(message, errorContext);
  }

  return new ConfluenceValidationError(message, errorContext);
}

export function createConfluenceErrorFromUnknown(
  error: unknown,
  context: Omit<ConfluenceErrorContext, "status" | "responseBody" | "retryAfterMs">,
) {
  if (error instanceof ConfluenceClientError) {
    return error;
  }

  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown Confluence client error.";

  if (name === "TimeoutError" || name === "AbortError" || error instanceof TypeError) {
    return new ConfluenceTransientError(`Confluence request failed: ${message}`, {
      ...context,
      cause: error,
    });
  }

  return new ConfluenceClientError(`Confluence request failed: ${message}`, {
    ...context,
    cause: error,
  });
}
