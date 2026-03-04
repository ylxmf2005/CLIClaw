import * as fs from "node:fs";
import * as path from "node:path";

import { IpcClient } from "../../ipc-client.js";
import { getSocketPath, getDefaultConfig, isDaemonRunning } from "../../../daemon/daemon.js";
import { HiBossDatabase } from "../../../daemon/db/database.js";
import { setupAgentHome } from "../../../agent/home-setup.js";
import type { SetupCheckResult } from "../../../daemon/ipc/types.js";
import type { SetupConfig } from "./types.js";
import { generateToken } from "../../../agent/auth.js";
import {
  DEFAULT_PERMISSION_POLICY,
  DEFAULT_SESSION_CONCURRENCY_GLOBAL,
  DEFAULT_SESSION_CONCURRENCY_PER_AGENT,
} from "../../../shared/defaults.js";
import { SETTINGS_VERSION, type Settings } from "../../../shared/settings.js";
import { getSettingsPath, writeSettingsFileAtomic } from "../../../shared/settings-io.js";
import { syncSettingsToDb } from "../../../daemon/settings-sync.js";
import { parseUserPermissionPolicy } from "../../../shared/user-permissions.js";

export interface SetupUserInfoStatus {
  bossName?: string;
  bossTimezone?: string;
  hasAdminToken: boolean;
  missing: {
    bossName: boolean;
    bossTimezone: boolean;
    adminToken: boolean;
  };
}

export interface SetupStatus {
  completed: boolean;
  ready: boolean;
  hasSettingsFile: boolean;
  agents: Array<{
    name: string;
    workspace?: string;
    provider?: "claude" | "codex";
  }>;
  userInfo: SetupUserInfoStatus;
}

function buildUserInfoStatus(db: HiBossDatabase): SetupUserInfoStatus {
  const bossName = (db.getBossName() ?? "").trim();
  const bossTimezone = (db.getConfig("boss_timezone") ?? "").trim();
  const hasAdminToken = (() => {
    const raw = (db.getConfig("user_permission_policy") ?? "").trim();
    if (!raw) return false;
    try {
      const policy = parseUserPermissionPolicy(raw);
      return policy.tokens.some((item) => item.role === "admin");
    } catch {
      return false;
    }
  })();
  return {
    bossName: bossName || undefined,
    bossTimezone: bossTimezone || undefined,
    hasAdminToken,
    missing: {
      bossName: bossName.length === 0,
      bossTimezone: bossTimezone.length === 0,
      adminToken: !hasAdminToken,
    },
  };
}

function buildEmptySetupStatus(): SetupStatus {
  return {
    completed: false,
    ready: false,
    hasSettingsFile: false,
    agents: [],
    userInfo: {
      hasAdminToken: false,
      missing: {
        bossName: true,
        bossTimezone: true,
        adminToken: true,
      },
    },
  };
}

function buildSetupStatusFromDb(db: HiBossDatabase): SetupStatus {
  const daemonConfig = getDefaultConfig();
  const hasSettingsFile = fs.existsSync(getSettingsPath(daemonConfig.dataDir));
  const completed = db.isSetupComplete();
  const agents = db.listAgents();
  const userInfo = buildUserInfoStatus(db);
  const hasMissingUserInfo = Object.values(userInfo.missing).some(Boolean);
  const ready =
    hasSettingsFile &&
    completed &&
    !hasMissingUserInfo;

  return {
    completed,
    ready,
    hasSettingsFile,
    agents: agents.map((agent) => ({
      name: agent.name,
      ...(agent.workspace ? { workspace: agent.workspace } : {}),
      ...(agent.provider ? { provider: agent.provider } : {}),
    })),
    userInfo,
  };
}

/**
 * Check setup health (tries IPC first, falls back to direct DB).
 */
export async function checkSetupStatus(): Promise<SetupStatus> {
  const daemonConfig = getDefaultConfig();
  const hasSettingsFile = fs.existsSync(getSettingsPath(daemonConfig.dataDir));
  try {
    const client = new IpcClient(getSocketPath());
    const result = await client.call<SetupCheckResult>("setup.check");

    const userInfo = result.userInfo ?? buildEmptySetupStatus().userInfo;
    const hasMissingUserInfo = Object.values(userInfo.missing).some(Boolean);
    const remoteReady =
      typeof result.ready === "boolean"
        ? result.ready
        : result.completed &&
          !hasMissingUserInfo;

    return {
      completed: result.completed,
      ready: hasSettingsFile && remoteReady,
      hasSettingsFile,
      agents: result.agents ?? [],
      userInfo,
    };
  } catch (err) {
    if (await isDaemonRunning()) {
      throw new Error(`Failed to check setup via daemon: ${(err as Error).message}`);
    }

    if (!fs.existsSync(daemonConfig.daemonDir)) {
      return buildEmptySetupStatus();
    }

    const dbPath = path.join(daemonConfig.daemonDir, "hiboss.db");
    if (!fs.existsSync(dbPath)) {
      return buildEmptySetupStatus();
    }

    const db = new HiBossDatabase(dbPath);
    try {
      return buildSetupStatusFromDb(db);
    } finally {
      db.close();
    }
  }
}

/**
 * Execute full first-time setup.
 */
export async function executeSetup(config: SetupConfig): Promise<{
  primaryAgentToken: string;
  secondaryAgentToken: string;
  userTokens: Array<{ principal: string; token: string }>;
}> {
  if (await isDaemonRunning()) {
    throw new Error("Daemon is running. Stop it first: hiboss daemon stop --token <admin-token>");
  }
  return executeSetupDirect(config);
}

async function executeSetupDirect(config: SetupConfig): Promise<{
  primaryAgentToken: string;
  secondaryAgentToken: string;
  userTokens: Array<{ principal: string; token: string }>;
}> {
  const daemonConfig = getDefaultConfig();
  fs.mkdirSync(daemonConfig.dataDir, { recursive: true });
  fs.mkdirSync(daemonConfig.daemonDir, { recursive: true });

  const dbPath = path.join(daemonConfig.daemonDir, "hiboss.db");
  const db = new HiBossDatabase(dbPath);
  try {
    if (db.isSetupComplete()) {
      const settingsPath = getSettingsPath(daemonConfig.dataDir);
      if (fs.existsSync(settingsPath)) {
        throw new Error("Setup already completed");
      }
      throw new Error(
        [
          `Setup state is incomplete: DB is marked complete but settings file is missing: ${settingsPath}`,
          "Reset the data directory before running setup again.",
        ].join("\n")
      );
    }

    await setupAgentHome(config.primaryAgent.name, daemonConfig.dataDir);
    await setupAgentHome(config.secondaryAgent.name, daemonConfig.dataDir);

    const primaryAgentToken = generateToken();
    const secondaryAgentToken = generateToken();
    const userTokens = config.adapter.adapterBossIds.map((principal) => ({
      principal,
      token: generateToken(),
    }));

    const settings: Settings = {
      version: SETTINGS_VERSION,
      timezone: config.bossTimezone,
      permissionPolicy: {
        operations: {
          ...DEFAULT_PERMISSION_POLICY.operations,
        },
      },
      tokens: [
        {
          name: config.bossName,
          token: config.adminToken.toLowerCase(),
          role: "admin",
        },
        ...userTokens.map((item) => ({
          name: item.principal,
          token: item.token.toLowerCase(),
          role: "admin" as const,
          bindings: [
            {
              adapterType: config.adapter.adapterType,
              uid: item.principal,
            },
          ],
        })),
      ],
      runtime: {
        sessionConcurrency: {
          perAgent: DEFAULT_SESSION_CONCURRENCY_PER_AGENT,
          global: DEFAULT_SESSION_CONCURRENCY_GLOBAL,
        },
      },
      agents: [
        {
          name: config.primaryAgent.name,
          token: primaryAgentToken,
          provider: config.primaryAgent.provider,
          description: config.primaryAgent.description ?? "",
          workspace: config.primaryAgent.workspace,
          model: config.primaryAgent.model ?? null,
          reasoningEffort: config.primaryAgent.reasoningEffort ?? null,
          permissionLevel: config.primaryAgent.permissionLevel ?? "standard",
          sessionPolicy: config.primaryAgent.sessionPolicy,
          metadata: config.primaryAgent.metadata,
          bindings: [
            {
              adapterType: config.adapter.adapterType,
              adapterToken: config.adapter.adapterToken,
            },
          ],
        },
        {
          name: config.secondaryAgent.name,
          token: secondaryAgentToken,
          provider: config.secondaryAgent.provider,
          description: config.secondaryAgent.description ?? "",
          workspace: config.secondaryAgent.workspace,
          model: config.secondaryAgent.model ?? null,
          reasoningEffort: config.secondaryAgent.reasoningEffort ?? null,
          permissionLevel: config.secondaryAgent.permissionLevel ?? "standard",
          sessionPolicy: config.secondaryAgent.sessionPolicy,
          metadata: config.secondaryAgent.metadata,
          bindings: [],
        },
      ],
    };

    await writeSettingsFileAtomic(daemonConfig.dataDir, settings);
    syncSettingsToDb(db, settings);

    return {
      primaryAgentToken,
      secondaryAgentToken,
      userTokens,
    };
  } finally {
    db.close();
  }
}
