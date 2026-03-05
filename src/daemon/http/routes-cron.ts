/**
 * Cron schedule HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import { sendJson } from "./server.js";

/**
 * Register cron routes.
 */
export function registerCronRoutes(router: HttpRouter, rpc: RpcMethodRegistry): void {
  // GET /api/cron
  router.get("/api/cron", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["cron.list"]!({ token });
  });

  // POST /api/cron
  router.post("/api/cron", async (ctx, _req, res) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const result = await rpc["cron.create"]!({ token, ...body });
    sendJson(res, 201, result);
  });

  // POST /api/cron/:id/enable
  router.post("/api/cron/:id/enable", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["cron.enable"]!({ token, id: ctx.params.id });
  });

  // POST /api/cron/:id/disable
  router.post("/api/cron/:id/disable", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["cron.disable"]!({ token, id: ctx.params.id });
  });

  // DELETE /api/cron/:id
  router.delete("/api/cron/:id", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["cron.delete"]!({ token, id: ctx.params.id });
  });
}
