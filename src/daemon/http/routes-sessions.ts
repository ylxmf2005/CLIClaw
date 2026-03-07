/**
 * Session and chat-state HTTP route handlers.
 */

import type { HttpRouter } from "./router.js";
import type { RpcMethodRegistry } from "../ipc/types.js";
import type { DaemonContext, Principal } from "../rpc/context.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import { generateUUID } from "../../shared/uuid.js";
import { isKnownAdapterType } from "../../shared/adapter-types.js";
import { logEvent } from "../../shared/daemon-log.js";
import { isValidAgentName, AGENT_NAME_ERROR_MESSAGE } from "../../shared/validation.js";
import { readPtyOutputChunks } from "../terminal/pty-history.js";

const VALID_REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

function assertPrincipalCanAccessAgent(
  daemonCtx: DaemonContext,
  principal: Principal,
  agentName: string,
): void {
  if (principal.kind === "agent" && principal.agent.name !== agentName) {
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
  }
  if (principal.kind === "user") {
    const decision = daemonCtx.db.evaluateUserTokenAgentAccess(principal.user.token, agentName);
    if (!decision.allowed) {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
    }
  }
}

function parseOptionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  return undefined;
}

/**
 * Register session and chat-state routes.
 */
export function registerSessionRoutes(
  router: HttpRouter,
  rpc: RpcMethodRegistry,
  daemonCtx: DaemonContext,
): void {
  // GET /api/agents/:name/chats/:chatId/messages — list full chat timeline
  router.get("/api/agents/:name/chats/:chatId/messages", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("envelope.list", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }

    const chatId = (ctx.params.chatId ?? "").trim();
    if (!chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "chatId is required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const rawLimit = ctx.query.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(500, Math.trunc(parsedLimit)))
      : 200;

    const statusRaw = (ctx.query.get("status") ?? "done").trim();
    if (statusRaw !== "done" && statusRaw !== "pending") {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Invalid status (expected pending or done)");
    }

    const envelopes = daemonCtx.db.listEnvelopesForAgentChat({
      agentName: agent.name,
      chatId,
      status: statusRaw,
      limit,
    });

    return { envelopes };
  });

  // GET /api/agents/:name/chats/:chatId/pty-history — list persisted PTY output chunks
  router.get("/api/agents/:name/chats/:chatId/pty-history", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("envelope.list", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }

    const chatId = (ctx.params.chatId ?? "").trim();
    if (!chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "chatId is required");
    }

    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }

    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const rawLimit = ctx.query.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(10_000, Math.trunc(parsedLimit)))
      : 2000;

    const chunks = readPtyOutputChunks({
      cliclawDir: daemonCtx.config.dataDir,
      agentName: agent.name,
      chatId,
      limit,
    });

    return { chunks };
  });

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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    let relayOn = daemonCtx.db.getChatRelayState(agent.name, chatId);

    // Relay state is persisted in DB, while active relay workers are in-memory.
    // After daemon restart, relayOn may still be true but the PTY worker is gone.
    // Ensure the worker exists so the terminal can attach to a live Codex/Claude session.
    if (relayOn && daemonCtx.relayAvailable && daemonCtx.relayExecutor) {
      const chatModelSettings = daemonCtx.db.getChatModelSettings(agent.name, chatId);
      const effectiveModel = chatModelSettings.modelOverride ?? agent.model;
      const result = await daemonCtx.relayExecutor.ensureSession({
        agentName: agent.name,
        chatId,
        provider: agent.provider ?? "claude",
        workspace: agent.workspace,
        model: effectiveModel,
      });
      if (!result.success) {
        logEvent("warn", "relay-session-restore-failed", {
          "agent-name": agent.name,
          "chat-id": chatId,
          error: result.error ?? "unknown error",
        });
        daemonCtx.db.setChatRelayState(agent.name, chatId, false);
        relayOn = false;
      }
    }

    return { agentName: agent.name, chatId, relayOn };
  });

  // GET /api/agents/:name/chats/:chatId/settings — get chat model/reasoning overrides
  router.get("/api/agents/:name/chats/:chatId/settings", async (ctx) => {
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const settings = daemonCtx.db.getChatModelSettings(agent.name, chatId);
    return {
      agentName: agent.name,
      chatId,
      ...(settings.modelOverride ? { modelOverride: settings.modelOverride } : {}),
      ...(settings.reasoningEffortOverride ? { reasoningEffortOverride: settings.reasoningEffortOverride } : {}),
    };
  });

  // PATCH /api/agents/:name/chats/:chatId/settings — update chat model/reasoning overrides
  router.patch("/api/agents/:name/chats/:chatId/settings", async (ctx) => {
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    if (!("modelOverride" in body) && !("reasoningEffortOverride" in body)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "Provide at least one of modelOverride or reasoningEffortOverride");
    }

    let modelOverride: string | null | undefined;
    if ("modelOverride" in body) {
      if (body.modelOverride === null || body.modelOverride === undefined) {
        modelOverride = null;
      } else if (typeof body.modelOverride === "string") {
        modelOverride = body.modelOverride.trim() || null;
      } else {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "modelOverride must be string|null");
      }
    }

    let reasoningEffortOverride: "none" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
    if ("reasoningEffortOverride" in body) {
      if (body.reasoningEffortOverride === null || body.reasoningEffortOverride === undefined) {
        reasoningEffortOverride = null;
      } else if (typeof body.reasoningEffortOverride === "string") {
        const normalized = body.reasoningEffortOverride.trim().toLowerCase();
        if (!VALID_REASONING_EFFORTS.has(normalized)) {
          rpcError(RPC_ERRORS.INVALID_PARAMS, "Invalid reasoningEffortOverride");
        }
        reasoningEffortOverride = normalized as "none" | "low" | "medium" | "high" | "xhigh" | "max";
      } else {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "reasoningEffortOverride must be string|null");
      }
    }

    daemonCtx.db.setChatModelSettings(agent.name, chatId, {
      ...(modelOverride !== undefined ? { modelOverride } : {}),
      ...(reasoningEffortOverride !== undefined ? { reasoningEffortOverride } : {}),
    });

    // Force the next turn for this chat to start with fresh provider args.
    const channelSession = daemonCtx.db.getOrCreateChannelSession({
      agentName: agent.name,
      adapterType: "internal",
      chatId,
      provider: agent.provider ?? "claude",
      touchExistingSession: false,
    });
    daemonCtx.db.updateAgentSessionProviderSessionId(channelSession.session.id, null, {
      provider: channelSession.session.provider,
    });
    daemonCtx.executor.invalidateChannelSessionCache(agent.name, "internal", chatId);
    daemonCtx.executor.closeActiveHistorySessionForChannel(
      agent.name,
      chatId,
      "chat-model-settings-updated"
    );

    const settings = daemonCtx.db.getChatModelSettings(agent.name, chatId);
    return {
      success: true,
      agentName: agent.name,
      chatId,
      ...(settings.modelOverride ? { modelOverride: settings.modelOverride } : {}),
      ...(settings.reasoningEffortOverride ? { reasoningEffortOverride: settings.reasoningEffortOverride } : {}),
    };
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

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
          updatedAt: b.updatedAt,
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

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
          updatedAt: b.updatedAt,
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

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

    // Check if this (adapterType, chatId) is already bound to a different session
    const existingBinding = daemonCtx.db.getChannelSessionBinding(agent.name, adapterType, chatId);
    if (existingBinding && existingBinding.sessionId !== session.id) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, `Binding (${adapterType}, ${chatId}) already belongs to another session`);
    }

    // Directly bind to the target session (atomic)
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
          updatedAt: b.updatedAt,
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

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
          updatedAt: b.updatedAt,
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const session = daemonCtx.db.getAgentSessionById(sessionId);
    if (!session || session.agentName !== agent.name) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    // Cascade: bindings + links are deleted by FK ON DELETE CASCADE
    const deleted = daemonCtx.db.deleteAgentSession(agent.name, session.id);
    if (!deleted) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Session not found");
    }

    // Emit event so WebSocket clients can refresh session lists
    daemonCtx.eventBus?.emit("session.deleted", {
      agentName: agent.name,
      sessionId: session.id,
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
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

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
          updatedAt: b.updatedAt,
        })),
      },
    };
  });

  // GET /api/agents/:name/boss-context — agent default use-BOSS setting
  router.get("/api/agents/:name/boss-context", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("chat.relay-toggle", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }
    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    return {
      agentName: agent.name,
      enabled: daemonCtx.db.getAgentUseBossDefault(agent.name),
    };
  });

  // PATCH /api/agents/:name/boss-context — set agent default use-BOSS setting
  router.patch("/api/agents/:name/boss-context", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("chat.relay-toggle", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }
    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    if (typeof body.enabled !== "boolean") {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "enabled must be a boolean");
    }
    daemonCtx.db.setAgentUseBossDefault(agent.name, body.enabled);
    daemonCtx.executor.requestSessionContextReload(agent.name, "http:agent-boss-default");
    return {
      success: true,
      agentName: agent.name,
      enabled: daemonCtx.db.getAgentUseBossDefault(agent.name),
    };
  });

  // GET /api/teams/:teamName/boss-context — team default use-BOSS setting
  router.get("/api/teams/:teamName/boss-context", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("team.status", principal);

    const teamName = (ctx.params.teamName ?? "").trim();
    if (!teamName) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "teamName is required");
    }
    const team = daemonCtx.db.getTeamByNameCaseInsensitive(teamName);
    if (!team) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Team not found");
    }

    return {
      teamName: team.name,
      enabled: daemonCtx.db.getTeamUseBossDefault(team.name),
    };
  });

  // PATCH /api/teams/:teamName/boss-context — set team default use-BOSS setting
  router.patch("/api/teams/:teamName/boss-context", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("team.set", principal);

    const teamName = (ctx.params.teamName ?? "").trim();
    if (!teamName) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "teamName is required");
    }
    const team = daemonCtx.db.getTeamByNameCaseInsensitive(teamName);
    if (!team) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Team not found");
    }
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    if (typeof body.enabled !== "boolean") {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "enabled must be a boolean");
    }
    daemonCtx.db.setTeamUseBossDefault(team.name, body.enabled);

    const members = daemonCtx.db.listTeamMemberAgentNames(team.name);
    for (const member of members) {
      daemonCtx.executor.requestSessionContextReload(member, "http:team-boss-default");
    }

    return {
      success: true,
      teamName: team.name,
      enabled: daemonCtx.db.getTeamUseBossDefault(team.name),
    };
  });

  // GET /api/agents/:name/chats/:chatId/boss-context — chat use-BOSS override/effective value
  router.get("/api/agents/:name/chats/:chatId/boss-context", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("chat.relay-toggle", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }
    const chatId = (ctx.params.chatId ?? "").trim();
    if (!chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "chatId is required");
    }
    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const settings = daemonCtx.db.getChatBossSettings(agent.name, chatId);
    return {
      agentName: agent.name,
      chatId,
      ...(settings.useBossOverride !== undefined ? { useBossOverride: settings.useBossOverride } : {}),
      ...(settings.ownerTokenName ? { ownerTokenName: settings.ownerTokenName } : {}),
      effectiveUseBoss: daemonCtx.db.getEffectiveUseBossForChat(agent.name, chatId),
    };
  });

  // PATCH /api/agents/:name/chats/:chatId/boss-context — set chat use-BOSS override
  router.patch("/api/agents/:name/chats/:chatId/boss-context", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("chat.relay-toggle", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }
    const chatId = (ctx.params.chatId ?? "").trim();
    if (!chatId) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "chatId is required");
    }
    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const useBossOverride = parseOptionalBoolean(body.useBossOverride);
    if (useBossOverride === undefined && body.useBossOverride !== null) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "useBossOverride must be boolean|null");
    }
    const prev = daemonCtx.db.getChatBossSettings(agent.name, chatId);
    daemonCtx.db.setChatBossSettings(agent.name, chatId, {
      useBossOverride,
      ownerTokenName: prev.ownerTokenName ?? null,
    });
    daemonCtx.executor.requestSessionContextReload(agent.name, "http:chat-boss-override");

    const settings = daemonCtx.db.getChatBossSettings(agent.name, chatId);
    return {
      success: true,
      agentName: agent.name,
      chatId,
      ...(settings.useBossOverride !== undefined ? { useBossOverride: settings.useBossOverride } : {}),
      ...(settings.ownerTokenName ? { ownerTokenName: settings.ownerTokenName } : {}),
      effectiveUseBoss: daemonCtx.db.getEffectiveUseBossForChat(agent.name, chatId),
    };
  });
}
