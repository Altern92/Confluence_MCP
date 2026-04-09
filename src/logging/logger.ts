import { getRequestLogContext } from "./request-context.js";

const redactedKeyPattern = /authorization|token|pat|password|secret/i;
const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];

export type Logger = {
  debug: (message: string, context?: unknown) => void;
  info: (message: string, context?: unknown) => void;
  warn: (message: string, context?: unknown) => void;
  error: (message: string, context?: unknown) => void;
};

function levelToPriority(level: LogLevel): number {
  return logLevels.indexOf(level);
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: "cause" in value ? sanitizeValue(value.cause) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        redactedKeyPattern.test(key) ? "[REDACTED]" : sanitizeValue(nestedValue),
      ]),
    );
  }

  return value;
}

function writeLog(level: LogLevel, message: string, context?: unknown) {
  const requestContext = getRequestLogContext();
  const mergedContext =
    requestContext == null
      ? context
      : {
          requestId: requestContext.requestId,
          traceId: requestContext.traceId,
          ...(context && typeof context === "object" && !Array.isArray(context) ? context : {}),
          ...(context && (typeof context !== "object" || Array.isArray(context))
            ? { value: context }
            : {}),
        };
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(mergedContext === undefined ? {} : { context: sanitizeValue(mergedContext) }),
  };

  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

export function createLogger(minLevel: LogLevel): Logger {
  const minPriority = levelToPriority(minLevel);

  const shouldLog = (level: LogLevel) => levelToPriority(level) >= minPriority;

  return {
    debug(message, context) {
      if (shouldLog("debug")) {
        writeLog("debug", message, context);
      }
    },
    info(message, context) {
      if (shouldLog("info")) {
        writeLog("info", message, context);
      }
    },
    warn(message, context) {
      if (shouldLog("warn")) {
        writeLog("warn", message, context);
      }
    },
    error(message, context) {
      if (shouldLog("error")) {
        writeLog("error", message, context);
      }
    },
  };
}
