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
import type { HiBossDatabase } from "../daemon/db/database.js";
import { logEvent, errorMessage } from "../shared/daemon-log.js";

export interface RelayExecutorOptions {
  broker: BrokerManager;
  db: HiBossDatabase;
  hibossDir: string;
}

/**
 * Generates the relay agent name for a specific agent + chat combination.
 * This ensures each chat gets its own PTY session.
 */
function relayAgentName(agentName: string, chatId: string): string {
  return `hiboss-${agentName}-${chatId}`;
}

/**
 * Relay executor that manages PTY-mode agent sessions.
 */
export class RelayExecutor {
  private broker: BrokerManager;
  private db: HiBossDatabase;
  private hibossDir: string;

  /** Track which agent+chat combos have active relay sessions. */
  private activeSessions = new Map<string, { relayName: string; spawnedAt: number }>();

  constructor(options: RelayExecutorOptions) {
    this.broker = options.broker;
    this.db = options.db;
    this.hibossDir = options.hibossDir;
  }

  /**
   * Check if relay mode is available (broker running).
   */
  isRelayAvailable(): boolean {
    return this.broker.isAvailable();
  }

  /**
   * Check if an agent+chat has an active relay session.
   */
  hasActiveSession(agentName: string, chatId: string): boolean {
    const key = `${agentName}:${chatId}`;
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

    const key = `${params.agentName}:${params.chatId}`;
    const existing = this.activeSessions.get(key);

    if (existing) {
      // Check if the relay agent is still alive
      const alive = await this.broker.hasAgent(existing.relayName);
      if (alive) return { success: true };
      // Clean up stale entry
      this.activeSessions.delete(key);
    }

    const relayName = relayAgentName(params.agentName, params.chatId);

    const result = await this.broker.spawnAgent({
      name: relayName,
      cli: params.provider,
      cwd: params.workspace ?? this.hibossDir,
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
    const key = `${params.agentName}:${params.chatId}`;
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
  async sendInput(agentName: string, chatId: string, data: string): Promise<void> {
    const key = `${agentName}:${chatId}`;
    const session = this.activeSessions.get(key);
    if (!session) return;

    await this.broker.sendInput(session.relayName, data);
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
    const key = `${agentName}:${chatId}`;
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
    const toRelease: Array<[string, { relayName: string }]> = [];

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
    const key = `${agentName}:${chatId}`;
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
