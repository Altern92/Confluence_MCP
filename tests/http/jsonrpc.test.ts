import type { Response } from "express";

import { describe, expect, it, vi } from "vitest";

import { writeJsonRpcError } from "../../src/http/jsonrpc.js";

function createMockResponse() {
  const response = {
    headersSent: false,
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response as unknown as Response;
}

describe("writeJsonRpcError", () => {
  it("writes a JSON-RPC error response", () => {
    const response = createMockResponse();

    writeJsonRpcError(response, 403, "Forbidden.", -32001);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Forbidden.",
      },
      id: null,
    });
  });

  it("does nothing when headers were already sent", () => {
    const response = createMockResponse() as Response & { headersSent: boolean };
    response.headersSent = true;

    writeJsonRpcError(response, 500, "Should not be written.");

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
