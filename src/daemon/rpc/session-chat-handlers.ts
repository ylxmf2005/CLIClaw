/**
 * Session and chat-state RPC handlers.
 *
 * Handles: session.list, chat.relay-toggle
 */

import type {
  RpcMethodRegistry,
  SessionListParams,
  ChatRelayToggleParams,
} from "../ipc/types.js";
import { RPC_ERRORS } from "../ipc/types.js";
import type { DaemonContext } from "./context.js";
import { requireToken, rpcError } from "./context.js";
import { isValidAgentName, AGENT_NAME_ERROR_MESSAGE } from "../../shared/validation.js";

/**
 * Create session and chat-state RPC handlers.
 */
export function createSessionChatHandlers(ctx: DaemonContext): RpcMethodRegistry {
  return {
    "session.list": async (params) => {
      const p = params as unknown as SessionListParams;
      const token = requireToken(p.token);
      const principal = ctx.resolvePrincipal(token);
      ctx.assertOperationAllowed("session.list", principal);

      if (typeof p.agentName !== "string" || !isValidAgentName(p.agentName)) {
        rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
      }

      if (principal.kind === "agent" && principal.agent.name !== p.agentName) {
        rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
      }

      const agent = ctx.db.getAgentByNameCaseInsensitive(p.agentName);
      if (!agent) {
        rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
      }

      const limit = typeof p.limit === "number" && Number.isFinite(p.limit)
        ? Math.max(1, Math.min(200, Math.trunc(p.limit)))
        : 20;

      const sessions = ctx.db.listAgentSessionsByAgent(agent.name, limit);

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          agentName: s.agentName,
          provider: s.provider,
          ...(s.providerSessionId ? { providerSessionId: s.providerSessionId } : {}),
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          ...(s.lastAdapterType ? { lastAdapterType: s.lastAdapterType } : {}),
          ...(s.lastChatId ? { lastChatId: s.lastChatId } : {}),
        })),
      };
    },

    "chat.relay-toggle": async (params) => {
      const p = params as unknown as ChatRelayToggleParams;
      const token = requireToken(p.token);
      const principal = ctx.resolvePrincipal(token);
      ctx.assertOperationAllowed("chat.relay-toggle", principal);

      if (typeof p.agentName !== "string" || !isValidAgentName(p.agentName)) {
        rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
      }

      if (typeof p.chatId !== "string" || !p.chatId.trim()) {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "chatId is required");
      }

      if (typeof p.relayOn !== "boolean") {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "relayOn must be a boolean");
      }

      const agent = ctx.db.getAgentByNameCaseInsensitive(p.agentName);
      if (!agent) {
        rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
      }

      ctx.db.setChatRelayState(agent.name, p.chatId.trim(), p.relayOn);

      return {
        success: true,
        agentName: agent.name,
        chatId: p.chatId.trim(),
        relayOn: p.relayOn,
      };
    },
  };
}
