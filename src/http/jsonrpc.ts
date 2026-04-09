import type { Response } from "express";

export function writeJsonRpcError(
  res: Response,
  statusCode: number,
  message: string,
  code = -32000,
) {
  if (res.headersSent) {
    return;
  }

  res.status(statusCode).json({
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id: null,
  });
}
