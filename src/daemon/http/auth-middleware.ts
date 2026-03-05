/**
 * Auth helpers for HTTP endpoints.
 *
 * Extracts token from RouteContext and calls RPC-level resolvePrincipal.
 */

import type { RouteContext } from "./router.js";
import type { DaemonContext, Principal } from "../rpc/context.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";

/**
 * Require a valid admin token from the request.
 * Throws RPC UNAUTHORIZED error if missing or invalid.
 */
export function requireAdmin(ctx: RouteContext, daemon: DaemonContext): Principal {
  const token = ctx.token;
  if (!token) {
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Unauthorized");
  }
  const principal = daemon.resolvePrincipal(token);
  return principal;
}

/**
 * Require a valid token (admin or agent) from the request.
 */
export function requireAuth(ctx: RouteContext, daemon: DaemonContext): { token: string; principal: Principal } {
  const token = ctx.token;
  if (!token) {
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Unauthorized");
  }
  const principal = daemon.resolvePrincipal(token);
  return { token, principal };
}
