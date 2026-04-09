import { once } from "node:events";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { createRequestTimeoutMiddleware } from "../../src/http/middleware/request-timeout.js";
import { createTestContext } from "../integration/helpers.js";

describe("createRequestTimeoutMiddleware", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (!server) {
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("returns a JSON-RPC timeout error when a request exceeds the configured timeout", async () => {
    const baseContext = createTestContext();
    const context = createTestContext({
      config: {
        ...baseContext.config,
        server: {
          ...baseContext.config.server,
          requestTimeoutMs: 50,
        },
      },
    });

    const app = express();
    app.use((_req, res, next) => {
      res.locals.requestId = "timeout-test";
      next();
    });
    app.use(createRequestTimeoutMiddleware(context));
    app.get("/slow", async (_req, res) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      if (!res.headersSent) {
        res.json({ status: "ok" });
      }
    });

    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/slow`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(408);
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Request timed out.",
      },
      id: null,
    });
  });
});
