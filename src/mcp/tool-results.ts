import * as z from "zod/v4";

import {
  ConfluenceAuthError,
  ConfluenceForbiddenError,
  ConfluenceRateLimitError,
  ConfluenceValidationError,
} from "../confluence/errors.js";
import { AccessPolicyError } from "../security/access-policy.js";

export type ToolErrorInfo = {
  message: string;
  structuredContent: {
    errorClass: string;
    retryable: boolean;
    status?: number;
    retryAfterMs?: number | null;
    issues?: Array<{
      path: string;
      message: string;
    }>;
  };
};

export function buildOutputValidationToolError(error: z.ZodError): ToolErrorInfo {
  return {
    message: "Tool output validation failed.",
    structuredContent: {
      errorClass: "output_validation",
      retryable: false,
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  };
}

export function toStructuredToolResult<T>(structuredContent: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

export function classifyToolError(error: unknown): ToolErrorInfo {
  if (error instanceof ConfluenceAuthError) {
    return {
      message: "Confluence authentication failed.",
      structuredContent: {
        errorClass: "confluence_auth",
        retryable: false,
        status: error.status ?? 401,
      },
    };
  }

  if (error instanceof ConfluenceForbiddenError) {
    return {
      message: "Confluence access was denied for this request.",
      structuredContent: {
        errorClass: "confluence_forbidden",
        retryable: false,
        status: error.status ?? 403,
      },
    };
  }

  if (error instanceof ConfluenceRateLimitError) {
    return {
      message: "Confluence rate limit was reached. Please retry shortly.",
      structuredContent: {
        errorClass: "confluence_rate_limit",
        retryable: true,
        status: error.status ?? 429,
        retryAfterMs: error.retryAfterMs,
      },
    };
  }

  if (error instanceof ConfluenceValidationError) {
    return {
      message: "Confluence request parameters were rejected by the upstream API.",
      structuredContent: {
        errorClass: "confluence_validation",
        retryable: false,
        status: error.status ?? 400,
      },
    };
  }

  if (error instanceof z.ZodError) {
    return {
      message: "Tool input validation failed.",
      structuredContent: {
        errorClass: "input_validation",
        retryable: false,
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  if (error instanceof AccessPolicyError) {
    return {
      message: error.message,
      structuredContent: {
        errorClass: "access_policy",
        retryable: false,
        status: 403,
      },
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      structuredContent: {
        errorClass: "internal_error",
        retryable: false,
      },
    };
  }

  return {
    message: "Unknown server error.",
    structuredContent: {
      errorClass: "unknown_error",
      retryable: false,
    },
  };
}

function isToolErrorInfo(value: unknown): value is ToolErrorInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    "structuredContent" in value
  );
}

export function toToolError(error: unknown | ToolErrorInfo) {
  const mapped = isToolErrorInfo(error) ? error : classifyToolError(error);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: mapped.message,
      },
    ],
    structuredContent: mapped.structuredContent,
  };
}
