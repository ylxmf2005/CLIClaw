/**
 * File upload HTTP route handler.
 *
 * POST /api/upload — multipart form data → media storage → return path.
 * Implements a minimal multipart parser (no external dependency).
 */

import type { IncomingMessage } from "node:http";
import type { HttpRouter } from "./router.js";
import type { DaemonContext } from "../rpc/context.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import { saveMediaFile } from "../media-storage.js";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Register file upload route.
 */
export function registerUploadRoutes(router: HttpRouter, daemonCtx: DaemonContext): void {
  router.post("/api/upload", async (ctx, req, res) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("envelope.send", principal);

    const { filename, data } = await parseMultipartFile(req);

    const result = saveMediaFile(daemonCtx.config.dataDir, filename, data);

    const responseBody = JSON.stringify({ path: result.relativePath });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(responseBody);
  });
}

/**
 * Parse the first file from a multipart/form-data request.
 */
async function parseMultipartFile(req: IncomingMessage): Promise<{ filename: string; data: Buffer }> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "Expected multipart/form-data");
  }

  const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
  if (!boundaryMatch) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "Missing multipart boundary");
  }
  const boundary = boundaryMatch[1]!;

  const raw = await collectBody(req, MAX_UPLOAD_SIZE);
  const boundaryBuf = Buffer.from(`--${boundary}`);

  // Find first part
  const start = indexOf(raw, boundaryBuf, 0);
  if (start < 0) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "No file part found");
  }

  const nextBoundary = indexOf(raw, boundaryBuf, start + boundaryBuf.length);
  if (nextBoundary < 0) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "Malformed multipart data");
  }

  const partData = raw.subarray(start + boundaryBuf.length, nextBoundary);

  // Find header/body separator (double CRLF)
  const headerEnd = indexOf(partData, Buffer.from("\r\n\r\n"), 0);
  if (headerEnd < 0) {
    rpcError(RPC_ERRORS.INVALID_PARAMS, "Malformed multipart part");
  }

  const headerStr = partData.subarray(0, headerEnd).toString("utf-8");
  const body = partData.subarray(headerEnd + 4, partData.length - 2); // strip trailing \r\n

  // Extract filename from Content-Disposition
  const filenameMatch = headerStr.match(/filename="([^"]+)"/);
  const filename = filenameMatch ? filenameMatch[1]! : "upload";

  return { filename, data: body };
}

function collectBody(req: IncomingMessage, maxSize: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error("File exceeds maximum size of 10MB"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function indexOf(buf: Buffer, search: Buffer, fromIndex: number): number {
  for (let i = fromIndex; i <= buf.length - search.length; i++) {
    let match = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
