/**
 * Daemon status HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";

/**
 * Register daemon routes.
 */
export function registerDaemonRoutes(router: HttpRouter, rpc: RpcMethodRegistry): void {
  // GET /api/daemon/status
  router.get("/api/daemon/status", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["daemon.status"]!({ token });
  });

  // GET /api/daemon/time
  router.get("/api/daemon/time", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["daemon.time"]!({ token });
  });
}
