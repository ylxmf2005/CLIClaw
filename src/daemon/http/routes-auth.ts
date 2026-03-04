/**
 * Auth and setup HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";

/**
 * Register auth and setup routes.
 */
export function registerAuthRoutes(router: HttpRouter, rpc: RpcMethodRegistry): void {
  // POST /api/auth/login — no token required; body has { token }
  router.post("/api/auth/login", async (ctx) => {
    const body = ctx.body as { token?: string } | undefined;
    const token = typeof body?.token === "string" ? body.token : "";
    return rpc["admin.verify"]!({ token });
  });

  // GET /api/setup/check — no token required
  router.get("/api/setup/check", async () => {
    return rpc["setup.check"]!({});
  });
}
