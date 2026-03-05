/**
 * Session and chat-state HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import type { DaemonContext } from "../rpc/context.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import { generateUUID } from "../../shared/uuid.js";
import { isKnownAdapterType } from "../../shared/adapter-types.js";

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

  // 4.1: GET /api/agents/:name/sessions — list sessions with bindings
  router.get("/api/agents/:name/sessions", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("session.list", principal);

    const agentName = ctx.params.name ?? "";
    if (!agentName) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Agent name is required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const sessions = daemonCtx.db.listAgentSessionsByAgent(agent.name);
    const result = sessions.map((s) => {
      const bindings = daemonCtx.db.getCoBindingsForSession(s.id);
      return {
        id: s.id,
        agentName: s.agentName,
        label: s.label,
        pinned: s.pinned,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActiveAt,
        bindings: bindings.map((b) => ({
          adapterType: b.adapterType,
          chatId: b.chatId,
          createdAt: b.updatedAt,
        })),
      };
    });

    return { sessions: result };
  });

  // 4.2: POST /api/agents/:name/sessions — create session with initial binding
  router.post("/api/agents/:name/sessions", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("session.list", principal);

    const agentName = ctx.params.name ?? "";
    if (!agentName) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Agent name is required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const adapterType = typeof body.adapterType === "string" ? body.adapterType.trim() : "";
    if (!adapterType) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "adapterType is required");
    }
    if (!isKnownAdapterType(adapterType)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, `Unknown adapter type: ${adapterType}`);
    }

    const chatId = typeof body.chatId === "string" && body.chatId.trim()
      ? body.chatId.trim()
      : `${adapterType}-chat-${generateUUID()}`;

    const provider = agent.provider ?? "claude";
    const result = daemonCtx.db.getOrCreateChannelSession({
      agentName: agent.name,
      adapterType,
      chatId,
      provider,
    });

    const bindings = daemonCtx.db.getCoBindingsForSession(result.session.id);
    return {
      session: {
        id: result.session.id,
        agentName: result.session.agentName,
        bindings: bindings.map((b) => ({
          adapterType: b.adapterType,
          chatId: b.chatId,
          createdAt: b.updatedAt,
        })),
      },
      chatId,
    };
  });

  // 4.3: POST /api/agents/:name/sessions/:id/bindings — add binding to session
  router.post("/api/agents/:name/sessions/:id/bindings", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("session.list", principal);

    const agentName = ctx.params.name ?? "";
    const sessionId = ctx.params.id ?? "";
    if (!agentName || !sessionId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Agent name and session ID are required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const session = daemonCtx.db.getAgentSessionById(sessionId);
    if (!session || session.agentName !== agent.name) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const adapterType = typeof body.adapterType === "string" ? body.adapterType.trim() : "";
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    if (!adapterType || !chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "adapterType and chatId are required");
    }
    if (!isKnownAdapterType(adapterType)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, `Unknown adapter type: ${adapterType}`);
    }

    // Use getOrCreateChannelSession to upsert the binding for this session's chat
    daemonCtx.db.getOrCreateChannelSession({
      agentName: agent.name,
      adapterType,
      chatId,
      provider: session.provider,
    });

    // Now switch the binding to point to the target session
    daemonCtx.db.switchChannelSession({
      agentName: agent.name,
      adapterType,
      chatId,
      targetSessionId: session.id,
    });

    const bindings = daemonCtx.db.getCoBindingsForSession(session.id);
    return {
      session: {
        id: session.id,
        agentName: session.agentName,
        bindings: bindings.map((b) => ({
          adapterType: b.adapterType,
          chatId: b.chatId,
          createdAt: b.updatedAt,
        })),
      },
    };
  });

  // 4.4a: PATCH /api/agents/:name/sessions/:id — update label/pinned
  router.patch("/api/agents/:name/sessions/:id", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("session.list", principal);

    const agentName = ctx.params.name ?? "";
    const sessionId = ctx.params.id ?? "";
    if (!agentName || !sessionId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Agent name and session ID are required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const session = daemonCtx.db.getAgentSessionById(sessionId);
    if (!session || session.agentName !== agent.name) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    let updated = false;

    if ("label" in body) {
      const label = body.label === null ? null : typeof body.label === "string" ? body.label.trim().slice(0, 100) : null;
      daemonCtx.db.updateSessionLabel(agent.name, session.id, label);
      updated = true;
    }

    if ("pinned" in body) {
      const pinned = !!body.pinned;
      daemonCtx.db.updateSessionPinned(agent.name, session.id, pinned);
      updated = true;
    }

    if (!updated) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "At least one of label or pinned must be provided");
    }

    const refreshed = daemonCtx.db.getAgentSessionById(session.id);
    const bindings = daemonCtx.db.getCoBindingsForSession(session.id);
    return {
      session: {
        id: refreshed!.id,
        agentName: refreshed!.agentName,
        label: refreshed!.label,
        pinned: refreshed!.pinned,
        createdAt: refreshed!.createdAt,
        lastActivityAt: refreshed!.lastActiveAt,
        bindings: bindings.map((b) => ({
          adapterType: b.adapterType,
          chatId: b.chatId,
          createdAt: b.updatedAt,
        })),
      },
    };
  });

  // 4.4b: DELETE /api/agents/:name/sessions/:id — delete entire session
  router.delete("/api/agents/:name/sessions/:id", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("session.list", principal);

    const agentName = ctx.params.name ?? "";
    const sessionId = ctx.params.id ?? "";
    if (!agentName || !sessionId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Agent name and session ID are required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const session = daemonCtx.db.getAgentSessionById(sessionId);
    if (!session || session.agentName !== agent.name) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    // Cascade: bindings + links are deleted by FK ON DELETE CASCADE
    const deleted = daemonCtx.db.deleteAgentSession(agent.name, session.id);
    if (!deleted) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    // Emit event so WebSocket clients can update
    daemonCtx.eventBus?.emit("agent.status", {
      name: agent.name,
      agentState: "idle",
      agentHealth: "ok",
    });

    return { success: true, deletedSessionId: session.id };
  });

  // 4.4c: DELETE /api/agents/:name/sessions/:id/bindings/:adapterType/:chatId
  router.delete("/api/agents/:name/sessions/:id/bindings/:adapterType/:chatId", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("session.list", principal);

    const agentName = ctx.params.name ?? "";
    const sessionId = ctx.params.id ?? "";
    const adapterType = ctx.params.adapterType ?? "";
    const chatId = ctx.params.chatId ?? "";
    if (!agentName || !sessionId || !adapterType || !chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "All path parameters are required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    const session = daemonCtx.db.getAgentSessionById(sessionId);
    if (!session || session.agentName !== agent.name) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    if (!isKnownAdapterType(adapterType)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, `Unknown adapter type: ${adapterType}`);
    }

    const binding = daemonCtx.db.getChannelSessionBinding(agent.name, adapterType, chatId);
    if (!binding || binding.sessionId !== session.id) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Binding not found");
    }

    const bindingCount = daemonCtx.db.countBindingsForSession(session.id);
    if (bindingCount <= 1) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "At least one binding must remain");
    }

    const deleted = daemonCtx.db.deleteChannelSessionBinding(agent.name, adapterType, chatId);
    if (!deleted) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Binding not found");
    }

    const bindings = daemonCtx.db.getCoBindingsForSession(session.id);
    return {
      session: {
        id: session.id,
        agentName: session.agentName,
        bindings: bindings.map((b) => ({
          adapterType: b.adapterType,
          chatId: b.chatId,
          createdAt: b.updatedAt,
        })),
      },
    };
  });
}
