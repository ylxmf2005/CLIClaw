/**
 * Agent HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import { sendJson } from "./server.js";

/**
 * Register agent routes.
 */
export function registerAgentRoutes(router: HttpRouter, rpc: RpcMethodRegistry): void {
  // GET /api/agents
  router.get("/api/agents", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["agent.list"]!({ token });
  });

  // POST /api/agents
  router.post("/api/agents", async (ctx, _req, res) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const result = await rpc["agent.register"]!({ token, ...body });
    sendJson(res, 201, result);
  });

  // GET /api/agents/:name
  router.get("/api/agents/:name", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["agent.status"]!({ token, agentName: ctx.params.name });
  });

  // PATCH /api/agents/:name
  router.patch("/api/agents/:name", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    return rpc["agent.set"]!({ token, agentName: ctx.params.name, ...body });
  });

  // DELETE /api/agents/:name
  router.delete("/api/agents/:name", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["agent.delete"]!({ token, agentName: ctx.params.name });
  });

  // POST /api/agents/:name/abort
  router.post("/api/agents/:name/abort", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["agent.abort"]!({ token, agentName: ctx.params.name });
  });

  // POST /api/agents/:name/refresh
  router.post("/api/agents/:name/refresh", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["agent.refresh"]!({ token, agentName: ctx.params.name });
  });

  // GET /api/agents/:name/conversations
  router.get("/api/agents/:name/conversations", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["envelope.conversations"]!({ token, agentName: ctx.params.name });
  });
}
