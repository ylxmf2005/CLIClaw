/**
 * Shared helpers for HTTP route handlers.
 */

import type { RouteContext } from "./router.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";

/**
 * Extract Bearer token from context, throwing if missing.
 */
export function requireTokenFromCtx(ctx: RouteContext): string {
  if (!ctx.token) {
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Unauthorized");
  }
  return ctx.token;
}
