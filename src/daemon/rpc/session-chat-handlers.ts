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

      const chatId = p.chatId.trim();
      const chatModelSettings = ctx.db.getChatModelSettings(agent.name, chatId);
      const effectiveModel = chatModelSettings.modelOverride ?? agent.model;

      if (p.relayOn) {
        if (!ctx.relayAvailable || !ctx.relayExecutor) {
          rpcError(RPC_ERRORS.INVALID_PARAMS, "Relay broker is not available");
        }
        const result = await ctx.relayExecutor.enableRelay({
          agentName: agent.name,
          chatId,
          provider: agent.provider ?? "claude",
          workspace: agent.workspace,
          model: effectiveModel,
        });
        if (!result.success) {
          rpcError(RPC_ERRORS.DELIVERY_FAILED, result.error ?? "Failed to enable relay mode");
        }
      } else if (ctx.relayExecutor) {
        await ctx.relayExecutor.disableRelay(agent.name, chatId);
      } else {
        ctx.db.setChatRelayState(agent.name, chatId, false);
      }

      return {
        success: true,
        agentName: agent.name,
        chatId,
        relayOn: p.relayOn,
      };
    },
  };
}
