/**
 * Team HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import { sendJson } from "./server.js";

/**
 * Register team routes.
 */
export function registerTeamRoutes(router: HttpRouter, rpc: RpcMethodRegistry): void {
  // GET /api/teams
  router.get("/api/teams", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const status = ctx.query.get("status") ?? undefined;
    return rpc["team.list"]!({ token, status });
  });

  // POST /api/teams
  router.post("/api/teams", async (ctx, _req, res) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const result = await rpc["team.register"]!({ token, ...body });
    sendJson(res, 201, result);
  });

  // GET /api/teams/:name
  router.get("/api/teams/:name", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["team.status"]!({ token, teamName: ctx.params.name });
  });

  // PATCH /api/teams/:name
  router.patch("/api/teams/:name", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    return rpc["team.set"]!({ token, teamName: ctx.params.name, ...body });
  });

  // DELETE /api/teams/:name
  router.delete("/api/teams/:name", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["team.delete"]!({ token, teamName: ctx.params.name });
  });

  // GET /api/teams/:name/members
  router.get("/api/teams/:name/members", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["team.list-members"]!({ token, teamName: ctx.params.name });
  });

  // POST /api/teams/:name/members
  router.post("/api/teams/:name/members", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    return rpc["team.add-member"]!({
      token,
      teamName: ctx.params.name,
      agentName: body.agentName,
    });
  });

  // DELETE /api/teams/:name/members/:agentName
  router.delete("/api/teams/:name/members/:agentName", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    return rpc["team.remove-member"]!({
      token,
      teamName: ctx.params.name,
      agentName: ctx.params.agentName,
    });
  });
}
