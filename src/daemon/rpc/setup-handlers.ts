/**
 * Setup and admin verification RPC handlers.
 */

import type { RpcMethodRegistry, AdminVerifyParams, AuthMeParams } from "../ipc/types.js";
import type { DaemonContext } from "./context.js";
import { parseUserPermissionPolicy } from "../../shared/user-permissions.js";
import { readBossProfile } from "../../shared/boss-profile.js";
import { rpcError } from "./context.js";
import { RPC_ERRORS } from "../ipc/types.js";

/**
 * Create setup RPC handlers.
 */
export function createSetupHandlers(ctx: DaemonContext): RpcMethodRegistry {
  const resolveIdentity = (tokenRaw: string): {
    token: string;
    tokenName: string;
    role: "admin" | "user" | "agent";
    displayName: string;
    fromBoss: boolean;
  } | null => {
    const token = tokenRaw.trim();
    if (!token) return null;

    const user = ctx.db.resolveTokenUser(token);
    if (user) {
      const profile = readBossProfile({
        cliclawDir: ctx.config.dataDir,
        tokenName: user.tokenName,
        defaultName: user.name,
      });
      const displayName = profile.ok ? profile.profile.name : user.name;
      return {
        token: user.token,
        tokenName: user.tokenName,
        role: user.role,
        displayName,
        fromBoss: user.role === "admin",
      };
    }

    const agent = ctx.db.findAgentByToken(token);
    if (!agent) return null;
    return {
      token,
      tokenName: agent.name,
      role: "agent",
      displayName: agent.name,
      fromBoss: false,
    };
  };

  return {
    "setup.check": async () => {
      const completed = ctx.db.isSetupComplete();
      const agents = ctx.db.listAgents();

      const bossName = (ctx.db.getBossName() ?? "").trim();
      const bossTimezone = (ctx.db.getConfig("boss_timezone") ?? "").trim();
      const hasAdminToken = (() => {
        const raw = (ctx.db.getConfig("user_permission_policy") ?? "").trim();
        if (!raw) return false;
        try {
          const policy = parseUserPermissionPolicy(raw);
          return policy.tokens.some((item) => item.role === "admin");
        } catch {
          return false;
        }
      })();
      const missingUserInfo = {
        bossName: bossName.length === 0,
        bossTimezone: bossTimezone.length === 0,
        adminToken: !hasAdminToken,
      };
      const hasMissingUserInfo = Object.values(missingUserInfo).some(Boolean);

      return {
        completed,
        ready:
          completed &&
          !hasMissingUserInfo,
        agents: agents.map((agent) => ({
          name: agent.name,
          workspace: agent.workspace,
          provider: agent.provider,
        })),
        userInfo: {
          bossName: bossName || undefined,
          bossTimezone: bossTimezone || undefined,
          hasAdminToken,
          missing: missingUserInfo,
        },
      };
    },

    // Admin methods
    "admin.verify": async (params) => {
      const p = params as unknown as AdminVerifyParams;
      const identity = resolveIdentity(p.token);
      return {
        valid: identity !== null,
        ...(identity ? { identity } : {}),
      };
    },

    "auth.me": async (params) => {
      const p = params as unknown as AuthMeParams;
      const identity = resolveIdentity(p.token);
      if (!identity) {
        rpcError(RPC_ERRORS.UNAUTHORIZED, "Invalid token");
      }
      return { identity };
    },
  };
}
