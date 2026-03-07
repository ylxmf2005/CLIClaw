/**
 * Daemon HTTP server.
 *
 * Node native `http` module server with:
 * - Configurable port (env CLICLAW_HTTP_PORT, default 3889)
 * - CORS support for local dev
 * - JSON body parsing
 * - Bearer token auth extraction
 */

import * as http from "node:http";
import { URL } from "node:url";
import type { HttpRouter, RouteContext } from "./router.js";
import { logEvent, errorMessage } from "../../shared/daemon-log.js";

const DEFAULT_PORT = 3889;
const MAX_BODY_SIZE = 11 * 1024 * 1024; // 11MB (slightly above 10MB upload limit)

export interface HttpServerOptions {
  router: HttpRouter;
  /**
   * Called for WebSocket upgrade requests.
   * If not set, upgrades are rejected.
   */
  onUpgrade?: (req: http.IncomingMessage, socket: import("node:net").Socket, head: Buffer) => void;
}

/**
 * Create and return an HTTP server (not yet listening).
 */
export function createHttpServer(options: HttpServerOptions): http.Server {
  const { router } = options;

  const server = http.createServer(async (req, res) => {
    // CORS preflight and headers
    setCorsHeaders(res, req);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;
      const method = req.method ?? "GET";

      const match = router.match(method, pathname);
      if (!match) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      const token = extractToken(req);
      const body = await parseJsonBody(req);

      const ctx: RouteContext = {
        params: match.params,
        query: url.searchParams,
        body,
        token,
      };

      const result = await match.handler(ctx, req, res);

      // If handler already sent a response (e.g. file upload), skip
      if (res.writableEnded) return;

      if (result === undefined) {
        sendJson(res, 204, undefined);
      } else {
        sendJson(res, 200, result);
      }
    } catch (err: unknown) {
      if (res.writableEnded) return;
      handleError(res, err);
    }
  });

  if (options.onUpgrade) {
    server.on("upgrade", options.onUpgrade);
  }

  return server;
}

/**
 * Start the HTTP server on the configured port.
 */
export function startHttpServer(server: http.Server): Promise<number> {
  const port = getPort();
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      logEvent("info", "http-server-started", { port });
      resolve(port);
    });
    server.once("error", reject);
  });
}

/**
 * Stop the HTTP server.
 */
export function stopHttpServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function getPort(): number {
  const envPort = process.env.CLICLAW_HTTP_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PORT;
}

function extractToken(req: http.IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

function setCorsHeaders(res: http.ServerResponse, req: http.IncomingMessage): void {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  if (data === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

async function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const contentType = req.headers["content-type"] ?? "";

  // Only parse JSON bodies
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (size === 0) {
        resolve(undefined);
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function handleError(res: http.ServerResponse, err: unknown): void {
  const error = err as Error & { code?: number };

  // RPC-style errors thrown by handlers
  if (typeof error.code === "number" && error.code < 0) {
    const status = rpcCodeToHttpStatus(error.code);
    sendJson(res, status, { error: { code: error.code, message: error.message } });
    return;
  }

  // Body parse errors
  if (error.message === "Invalid JSON body" || error.message === "Request body too large") {
    sendJson(res, 400, { error: { message: error.message } });
    return;
  }

  logEvent("error", "http-request-error", { error: errorMessage(err) });
  sendJson(res, 500, { error: { message: "Internal server error" } });
}

function rpcCodeToHttpStatus(code: number): number {
  switch (code) {
    case -32001: return 401; // UNAUTHORIZED
    case -32002: return 404; // NOT_FOUND
    case -32003: return 409; // ALREADY_EXISTS
    case -32602: return 400; // INVALID_PARAMS
    default: return 500;
  }
}
