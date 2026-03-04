/**
 * Session and chat-state HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import type { DaemonContext } from "../rpc/context.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";

/**
 * Register session and chat-state routes.
 */
export function registerSessionRoutes(
  router: HttpRouter,
  rpc: RpcMethodRegistry,
  daemonCtx: DaemonContext,
): void {
  // GET /api/sessions?agentName=<name>
  router.get("/api/sessions", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const agentName = ctx.query.get("agentName") ?? "";
    return rpc["session.list"]!({ token, agentName });
  });

  // POST /api/agents/:name/chats/:chatId/relay — toggle relay
  router.post("/api/agents/:name/chats/:chatId/relay", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    return rpc["chat.relay-toggle"]!({
      token,
      agentName: ctx.params.name,
      chatId: ctx.params.chatId,
      relayOn: body.relayOn,
    });
  });

  // GET /api/agents/:name/chats/:chatId/relay — get relay state
  router.get("/api/agents/:name/chats/:chatId/relay", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("chat.relay-toggle", principal);

    const agentName = ctx.params.name ?? "";
    const chatId = ctx.params.chatId ?? "";
    if (!agentName || !chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "agentName and chatId are required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const relayOn = daemonCtx.db.getChatRelayState(agent.name, chatId);
    return { agentName: agent.name, chatId, relayOn };
  });
}
