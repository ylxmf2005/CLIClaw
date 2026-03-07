/**
 * Relay-based executor for PTY mode agent sessions.
 *
 * Alternative to the pipe-based executor-turn.ts. When relay mode is
 * enabled for a chat, envelopes are injected into the running PTY session
 * via the relay broker rather than spawning a new -p process.
 *
 * Handles:
 * - Spawning agents via BrokerManager
 * - Injecting envelope content via sendMessage/sendInput
 * - Session resume via continueFrom (spawn with existing session)
 * - Mode switch: relay on → spawn agent; relay off → release agent
 */

import type { BrokerManager } from "../daemon/relay/broker-manager.js";
import type { CliClawDatabase } from "../daemon/db/database.js";
import { logEvent, errorMessage } from "../shared/daemon-log.js";
import { buildRelaySessionName } from "../daemon/relay/relay-session-name.js";

export interface RelayExecutorOptions {
  broker: BrokerManager;
  db: CliClawDatabase;
  cliclawDir: string;
}

interface RelaySessionEntry {
  relayName: string;
  spawnedAt: number;
}

interface RelaySendInputResult {
  success: boolean;
  error?: string;
}

/**
 * Relay executor that manages PTY-mode agent sessions.
 */
export class RelayExecutor {
  private broker: BrokerManager;
  private db: CliClawDatabase;
  private cliclawDir: string;

  /** Track which agent+chat combos have active relay sessions. */
  private activeSessions = new Map<string, RelaySessionEntry>();

  constructor(options: RelayExecutorOptions) {
    this.broker = options.broker;
    this.db = options.db;
    this.cliclawDir = options.cliclawDir;
  }

  /**
   * Check if relay mode is available (broker running).
   */
  isRelayAvailable(): boolean {
    return this.broker.isAvailable();
  }

  private buildSessionKey(agentName: string, chatId: string): string {
    return `${agentName}:${chatId}`;
  }

  private isUnknownWorkerError(err: unknown): boolean {
    const message = errorMessage(err).toLowerCase();
    return message.includes("unknown worker") || message.includes("agent_not_found");
  }

  private resolveRelaySpawnConfig(agentName: string, chatId: string): {
    agentName: string;
    chatId: string;
    provider: "claude" | "codex";
    workspace?: string;
    model?: string;
  } | null {
    const agent = this.db.getAgentByNameCaseInsensitive(agentName);
    if (!agent) return null;
    const chatModelSettings = this.db.getChatModelSettings(agent.name, chatId);
    return {
      agentName: agent.name,
      chatId,
      provider: agent.provider ?? "claude",
      workspace: agent.workspace,
      model: chatModelSettings.modelOverride ?? agent.model,
    };
  }

  /**
   * Check if an agent+chat has an active relay session.
   */
  hasActiveSession(agentName: string, chatId: string): boolean {
    const key = this.buildSessionKey(agentName, chatId);
    return this.activeSessions.has(key);
  }

  /**
   * Ensure a relay session exists for this agent+chat.
   * Spawns one if not already running.
   */
  async ensureSession(params: {
    agentName: string;
    chatId: string;
    provider: "claude" | "codex";
    workspace?: string;
    model?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.broker.isAvailable()) {
      return { success: false, error: "Relay broker not available" };
    }

    const key = this.buildSessionKey(params.agentName, params.chatId);
    const existing = this.activeSessions.get(key);

    if (existing) {
      // Check if the relay agent is still alive
      const alive = await this.broker.hasAgent(existing.relayName);
      if (alive) return { success: true };
      // Clean up stale entry
      this.activeSessions.delete(key);
    }

    const relayName = buildRelaySessionName(params.agentName, params.chatId);

    const result = await this.broker.spawnAgent({
      name: relayName,
      cli: params.provider,
      cwd: params.workspace ?? this.cliclawDir,
      model: params.model,
    });

    if (result.success) {
      this.activeSessions.set(key, {
        relayName,
        spawnedAt: Date.now(),
      });
      logEvent("info", "relay-session-started", {
        "agent-name": params.agentName,
        "chat-id": params.chatId,
        "relay-name": relayName,
      });
    }

    return result;
  }

  /**
   * Inject envelope text into a running relay session.
   * Used when an envelope arrives for an agent in relay mode.
   */
  async injectEnvelope(params: {
    agentName: string;
    chatId: string;
    text: string;
    from?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const key = this.buildSessionKey(params.agentName, params.chatId);
    const session = this.activeSessions.get(key);

    if (!session) {
      return { success: false, error: "No active relay session" };
    }

    try {
      await this.broker.sendMessage({
        to: session.relayName,
        text: params.text,
        from: params.from,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  /**
   * Send raw PTY input to a relay session.
   * Used for interactive terminal keystrokes.
   */
  async sendInput(agentName: string, chatId: string, data: string): Promise<RelaySendInputResult> {
    const spawnConfig = this.resolveRelaySpawnConfig(agentName, chatId);
    if (!spawnConfig) {
      return { success: false, error: `Agent not found: ${agentName}` };
    }

    const key = this.buildSessionKey(spawnConfig.agentName, chatId);
    const relayOn = this.db.getChatRelayState(spawnConfig.agentName, chatId);
    if (!relayOn) {
      return { success: false, error: "Relay mode is off for this chat" };
    }

    let session = this.activeSessions.get(key);
    if (!session) {
      const ensureResult = await this.ensureSession(spawnConfig);
      if (!ensureResult.success) {
        this.db.setChatRelayState(spawnConfig.agentName, chatId, false);
        return {
          success: false,
          error: ensureResult.error ?? "Failed to start relay session",
        };
      }
      session = this.activeSessions.get(key);
      if (!session) {
        this.db.setChatRelayState(spawnConfig.agentName, chatId, false);
        return { success: false, error: "Relay session unavailable after restore" };
      }
    }

    try {
      await this.broker.sendInput(session.relayName, data);
      return { success: true };
    } catch (err) {
      if (!this.isUnknownWorkerError(err)) {
        return { success: false, error: errorMessage(err) };
      }

      // Worker vanished; clear stale cache and rebuild once.
      this.activeSessions.delete(key);
      const ensureResult = await this.ensureSession(spawnConfig);
      if (!ensureResult.success) {
        this.db.setChatRelayState(spawnConfig.agentName, chatId, false);
        return {
          success: false,
          error: ensureResult.error ?? "Failed to restore relay session",
        };
      }

      const restored = this.activeSessions.get(key);
      if (!restored) {
        this.db.setChatRelayState(spawnConfig.agentName, chatId, false);
        return { success: false, error: "Relay session unavailable after retry" };
      }

      try {
        await this.broker.sendInput(restored.relayName, data);
        logEvent("info", "relay-input-recovered", {
          "agent-name": spawnConfig.agentName,
          "chat-id": chatId,
          "relay-name": restored.relayName,
        });
        return { success: true };
      } catch (retryErr) {
        if (this.isUnknownWorkerError(retryErr)) {
          this.activeSessions.delete(key);
          this.db.setChatRelayState(spawnConfig.agentName, chatId, false);
        }
        return { success: false, error: errorMessage(retryErr) };
      }
    }
  }

  /**
   * Switch a chat to relay mode.
   * Spawns a relay session and persists the toggle.
   */
  async enableRelay(params: {
    agentName: string;
    chatId: string;
    provider: "claude" | "codex";
    workspace?: string;
    model?: string;
  }): Promise<{ success: boolean; error?: string }> {
    this.db.setChatRelayState(params.agentName, params.chatId, true);

    const result = await this.ensureSession(params);
    if (!result.success) {
      // Revert the toggle if spawn failed
      this.db.setChatRelayState(params.agentName, params.chatId, false);
    }
    return result;
  }

  /**
   * Switch a chat out of relay mode.
   * Releases the relay session.
   */
  async disableRelay(agentName: string, chatId: string): Promise<void> {
    this.db.setChatRelayState(agentName, chatId, false);
    await this.releaseSession(agentName, chatId, "mode-switch-off");
  }

  /**
   * Release (stop) a relay session for an agent+chat.
   */
  async releaseSession(agentName: string, chatId: string, reason?: string): Promise<void> {
    const key = this.buildSessionKey(agentName, chatId);
    const session = this.activeSessions.get(key);
    if (!session) return;

    await this.broker.releaseAgent(session.relayName, reason);
    this.activeSessions.delete(key);

    logEvent("info", "relay-session-released", {
      "agent-name": agentName,
      "chat-id": chatId,
      reason: reason ?? "explicit",
    });
  }

  /**
   * Release all relay sessions for an agent (e.g., agent deletion).
   */
  async releaseAllForAgent(agentName: string): Promise<void> {
    const prefix = `${agentName}:`;
    const toRelease: Array<[string, RelaySessionEntry]> = [];

    for (const [key, session] of this.activeSessions) {
      if (key.startsWith(prefix)) {
        toRelease.push([key, session]);
      }
    }

    for (const [key, session] of toRelease) {
      await this.broker.releaseAgent(session.relayName, "agent-cleanup");
      this.activeSessions.delete(key);
    }
  }

  /**
   * Release all relay sessions (daemon shutdown).
   */
  async releaseAll(): Promise<void> {
    for (const [key, session] of this.activeSessions) {
      await this.broker.releaseAgent(session.relayName, "daemon-shutdown").catch(() => {});
    }
    this.activeSessions.clear();
  }

  /**
   * Interrupt a relay agent (ESC ESC).
   */
  async interruptAgent(agentName: string, chatId: string): Promise<boolean> {
    const key = this.buildSessionKey(agentName, chatId);
    const session = this.activeSessions.get(key);
    if (!session) return false;

    return this.broker.interruptAgent(session.relayName);
  }

  /**
   * Get count of active relay sessions.
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}
