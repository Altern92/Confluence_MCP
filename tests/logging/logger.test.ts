import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/logging/logger.js";
import { runWithRequestContext } from "../../src/logging/request-context.js";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("automatically includes the requestId and traceId from request context", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger("info");

    runWithRequestContext({ requestId: "req-123", traceId: "trace-456" }, () => {
      logger.info("Test log", {
        operation: "search",
      });
    });

    const payload = JSON.parse(String(writeSpy.mock.calls[0]?.[0])) as {
      context?: Record<string, unknown>;
    };

    expect(payload.context).toEqual({
      requestId: "req-123",
      traceId: "trace-456",
      operation: "search",
    });
  });
});
