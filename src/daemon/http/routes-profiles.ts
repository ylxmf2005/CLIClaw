import type { HttpRouter } from "./router.js";
import type { DaemonContext, Principal } from "../rpc/context.js";
import { rpcError } from "../rpc/context.js";
import { RPC_ERRORS } from "../ipc/types.js";
import { requireTokenFromCtx } from "./route-helpers.js";
import {
  readBossProfile,
  writeBossProfile,
} from "../../shared/boss-profile.js";
import {
  readAgentInternalSoulSnapshot,
  writeAgentInternalSoul,
} from "../../shared/internal-space.js";
import { isValidAgentName, AGENT_NAME_ERROR_MESSAGE } from "../../shared/validation.js";

function readStringField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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

function getHumanIdentity(
  daemonCtx: DaemonContext,
  principal: Principal,
  token: string,
): {
  token: string;
  tokenName: string;
  name: string;
  role: "admin" | "user";
} {
  if (principal.kind !== "admin" && principal.kind !== "user") {
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Human token required");
  }
  if (principal.kind === "user") {
    return principal.user;
  }
  const user = daemonCtx.db.resolveTokenUser(token);
  if (!user || user.role !== "admin") {
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Human token required");
  }
  return user;
}

export function registerProfileRoutes(router: HttpRouter, daemonCtx: DaemonContext): void {
  // GET /api/boss-profiles/me
  router.get("/api/boss-profiles/me", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);
    const identity = getHumanIdentity(daemonCtx, principal, token);
    const profile = readBossProfile({
      cliclawDir: daemonCtx.config.dataDir,
      tokenName: identity.tokenName,
      defaultName: identity.name,
    });
    if (!profile.ok) {
      rpcError(RPC_ERRORS.INTERNAL_ERROR, profile.error);
    }
    return { profile: profile.profile };
  });

  // PATCH /api/boss-profiles/me
  router.patch("/api/boss-profiles/me", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);
    const identity = getHumanIdentity(daemonCtx, principal, token);

    const current = readBossProfile({
      cliclawDir: daemonCtx.config.dataDir,
      tokenName: identity.tokenName,
      defaultName: identity.name,
    });
    if (!current.ok) {
      rpcError(RPC_ERRORS.INTERNAL_ERROR, current.error);
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const nextName = readStringField(body.name) ?? current.profile.name;
    const nextVersion = readStringField(body.version) ?? current.profile.version;
    const nextContent =
      typeof body.content === "string"
        ? body.content
        : current.profile.content;
    const metadataInput = body.metadata;
    let metadata = current.profile.metadata;
    if (metadataInput !== undefined) {
      if (metadataInput === null || typeof metadataInput !== "object" || Array.isArray(metadataInput)) {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "metadata must be an object");
      }
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadataInput as Record<string, unknown>)) {
        if (typeof value !== "string") {
          rpcError(RPC_ERRORS.INVALID_PARAMS, `metadata.${key} must be string`);
        }
        normalized[key] = value;
      }
      metadata = normalized;
    }

    const written = writeBossProfile({
      cliclawDir: daemonCtx.config.dataDir,
      tokenName: identity.tokenName,
      name: nextName,
      version: nextVersion,
      content: nextContent,
      metadata,
    });
    if (!written.ok) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, written.error);
    }

    for (const agent of daemonCtx.db.listAgents()) {
      daemonCtx.executor.requestSessionContextReload(agent.name, "http:boss-profile-update");
    }
    return { success: true, profile: written.profile };
  });

  // GET /api/boss-profiles — admin list
  router.get("/api/boss-profiles", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);
    if (principal.kind !== "admin") {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
    }
    const users = daemonCtx.db.listTokenUsers();
    return {
      profiles: users.map((user) => {
        const profile = readBossProfile({
          cliclawDir: daemonCtx.config.dataDir,
          tokenName: user.tokenName,
          defaultName: user.name,
        });
        if (!profile.ok) {
          return {
            tokenName: user.tokenName,
            name: user.name,
            role: user.role,
            error: profile.error,
          };
        }
        return {
          tokenName: profile.profile.tokenName,
          name: profile.profile.name,
          version: profile.profile.version,
          role: user.role,
          content: profile.profile.content,
          metadata: profile.profile.metadata,
          path: profile.profile.path,
        };
      }),
    };
  });

  // GET /api/boss-profiles/:tokenName
  router.get("/api/boss-profiles/:tokenName", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);

    const tokenName = (ctx.params.tokenName ?? "").trim().toLowerCase();
    if (!tokenName) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "tokenName is required");
    }
    if (principal.kind === "user" && principal.user.tokenName !== tokenName) {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
    }
    if (principal.kind === "admin" || principal.kind === "user") {
      const self = daemonCtx.db.listTokenUsers().find((item) => item.tokenName === tokenName);
      if (!self) {
        rpcError(RPC_ERRORS.NOT_FOUND, "Token profile not found");
      }
      const profile = readBossProfile({
        cliclawDir: daemonCtx.config.dataDir,
        tokenName,
        defaultName: self.name,
      });
      if (!profile.ok) {
        rpcError(RPC_ERRORS.INTERNAL_ERROR, profile.error);
      }
      return { profile: profile.profile };
    }
    rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
  });

  // PATCH /api/boss-profiles/:tokenName
  router.patch("/api/boss-profiles/:tokenName", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);

    const tokenName = (ctx.params.tokenName ?? "").trim().toLowerCase();
    if (!tokenName) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, "tokenName is required");
    }
    if (principal.kind === "user" && principal.user.tokenName !== tokenName) {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
    }
    if (principal.kind !== "admin" && principal.kind !== "user") {
      rpcError(RPC_ERRORS.UNAUTHORIZED, "Access denied");
    }

    const target = daemonCtx.db.listTokenUsers().find((item) => item.tokenName === tokenName);
    if (!target) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Token profile not found");
    }

    const current = readBossProfile({
      cliclawDir: daemonCtx.config.dataDir,
      tokenName,
      defaultName: target.name,
    });
    if (!current.ok) {
      rpcError(RPC_ERRORS.INTERNAL_ERROR, current.error);
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const nextName = readStringField(body.name) ?? current.profile.name;
    const nextVersion = readStringField(body.version) ?? current.profile.version;
    const nextContent =
      typeof body.content === "string"
        ? body.content
        : current.profile.content;
    const metadataInput = body.metadata;
    let metadata = current.profile.metadata;
    if (metadataInput !== undefined) {
      if (metadataInput === null || typeof metadataInput !== "object" || Array.isArray(metadataInput)) {
        rpcError(RPC_ERRORS.INVALID_PARAMS, "metadata must be an object");
      }
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadataInput as Record<string, unknown>)) {
        if (typeof value !== "string") {
          rpcError(RPC_ERRORS.INVALID_PARAMS, `metadata.${key} must be string`);
        }
        normalized[key] = value;
      }
      metadata = normalized;
    }

    const written = writeBossProfile({
      cliclawDir: daemonCtx.config.dataDir,
      tokenName,
      name: nextName,
      version: nextVersion,
      content: nextContent,
      metadata,
    });
    if (!written.ok) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, written.error);
    }

    for (const agent of daemonCtx.db.listAgents()) {
      daemonCtx.executor.requestSessionContextReload(agent.name, "http:boss-profile-update");
    }
    return { success: true, profile: written.profile };
  });

  // GET /api/agents/:name/soul
  router.get("/api/agents/:name/soul", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }
    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const soul = readAgentInternalSoulSnapshot({
      cliclawDir: daemonCtx.config.dataDir,
      agentName: agent.name,
    });
    if (!soul.ok) {
      rpcError(RPC_ERRORS.INTERNAL_ERROR, soul.error);
    }
    return {
      soul: {
        version: soul.version,
        content: soul.note,
        path: soul.path,
      },
    };
  });

  // PATCH /api/agents/:name/soul
  router.patch("/api/agents/:name/soul", async (ctx) => {
    const token = requireTokenFromCtx(ctx);
    const principal = daemonCtx.resolvePrincipal(token);
    daemonCtx.assertOperationAllowed("agent.status", principal);

    const agentName = (ctx.params.name ?? "").trim();
    if (!agentName || !isValidAgentName(agentName)) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, AGENT_NAME_ERROR_MESSAGE);
    }
    const agent = daemonCtx.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) {
      rpcError(RPC_ERRORS.NOT_FOUND, "Agent not found");
    }
    assertPrincipalCanAccessAgent(daemonCtx, principal, agent.name);

    const current = readAgentInternalSoulSnapshot({
      cliclawDir: daemonCtx.config.dataDir,
      agentName: agent.name,
    });
    if (!current.ok) {
      rpcError(RPC_ERRORS.INTERNAL_ERROR, current.error);
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const version = readStringField(body.version) ?? current.version;
    const content = typeof body.content === "string" ? body.content : current.note;
    const written = writeAgentInternalSoul({
      cliclawDir: daemonCtx.config.dataDir,
      agentName: agent.name,
      version,
      note: content,
    });
    if (!written.ok) {
      rpcError(RPC_ERRORS.INVALID_PARAMS, written.error);
    }
    daemonCtx.executor.requestSessionContextReload(agent.name, "http:soul-update");
    return {
      success: true,
      soul: {
        version: written.version,
        content: written.note,
        path: written.path,
      },
    };
  });
}
