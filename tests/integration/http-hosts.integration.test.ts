import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { closeServer, createTestContext, startTestServer } from "./helpers.js";

function sendHostRequest(server: HttpServer, hostHeader: string) {
  const address = server.address() as AddressInfo;

  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/mcp",
        method: "GET",
        headers: {
          Host: hostHeader,
        },
      },
      async (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        await once(res, "end");

        resolve({
          statusCode: res.statusCode ?? 0,
          body,
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("integration: host allowlist", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (!server) {
        continue;
      }

      await closeServer(server);
    }
  });

  it("rejects /mcp requests from non-allowlisted hosts", async () => {
    const baseContext = createTestContext();
    const server = await startTestServer(
      createTestContext({
        config: {
          ...baseContext.config,
          server: {
            ...baseContext.config.server,
            allowedHosts: ["chatgpt.example.com"],
          },
        },
      }),
    );
    servers.push(server);

    const response = await sendHostRequest(server, "localhost");
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(response.statusCode).toBe(403);
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid Host: localhost",
      },
      id: null,
    });
  });
});
