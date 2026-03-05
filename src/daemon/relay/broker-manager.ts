/**
 * Relay broker lifecycle manager.
 *
 * Wraps @agent-relay/sdk's RelayAdapter to manage the broker subprocess.
 * Handles:
 * - Binary detection (graceful degradation if missing)
 * - Start/stop lifecycle tied to daemon
 * - PTY output → DaemonEventBus as agent.pty.output
 * - PTY input from DaemonEventBus → RelayAdapter.sendInput()
 * - Agent spawn/release for relay mode sessions
 */

import type { DaemonEventBus } from "../events/event-bus.js";
import { logEvent, errorMessage } from "../../shared/daemon-log.js";
import { buildRelaySessionName, parseRelaySessionName } from "./relay-session-name.js";

// Dynamic import to handle missing SDK gracefully
let RelayAdapterClass: typeof import("@agent-relay/sdk").RelayAdapter | null = null;
type RelayAdapterInstance = import("@agent-relay/sdk").RelayAdapter;

async function loadRelayAdapter(): Promise<typeof import("@agent-relay/sdk").RelayAdapter | null> {
  try {
    const mod = await import("@agent-relay/sdk");
    return mod.RelayAdapter;
  } catch {
    return null;
  }
}

export interface BrokerManagerOptions {
  /** Project directory for the broker (usually hiboss data dir). */
  cwd: string;
  /** Event bus for PTY output events. */
  eventBus: DaemonEventBus;
}

/**
 * Manages the agent-relay broker lifecycle.
 */
export class BrokerManager {
  private adapter: RelayAdapterInstance | null = null;
  private eventUnsubscribe: (() => void) | null = null;
  private inputUnsubscribe: (() => void) | null = null;
  private available = false;
  private started = false;
  private cwd: string;
  private eventBus: DaemonEventBus;

  constructor(options: BrokerManagerOptions) {
    this.cwd = options.cwd;
    this.eventBus = options.eventBus;
  }

  /**
   * Whether the relay broker is available and running.
   */
  isAvailable(): boolean {
    return this.available && this.started;
  }

  /**
   * Start the relay broker. Returns silently if broker binary is missing.
   */
  async start(): Promise<void> {
    if (this.started) return;

    // Try to load the SDK
    if (!RelayAdapterClass) {
      RelayAdapterClass = await loadRelayAdapter();
    }

    if (!RelayAdapterClass) {
      logEvent("info", "relay-broker-unavailable", { reason: "sdk-not-found" });
      return;
    }

    try {
      this.adapter = new RelayAdapterClass({
        cwd: this.cwd,
        clientName: "hiboss-daemon",
      });

      await this.adapter.start();
      this.available = true;
      this.started = true;

      // Subscribe to broker events for PTY output
      this.eventUnsubscribe = this.adapter.onEvent((event) => {
        if (event.kind === "worker_stream") {
          const parsed = parseRelaySessionName(event.name);
          this.eventBus.emit("agent.pty.output", {
            name: parsed?.agentName ?? event.name,
            chatId: parsed?.chatId,
            data: event.chunk,
          });
        }
      });

      // Subscribe to PTY input events from the event bus
      this.inputUnsubscribe = this.subscribeToPtyInput();

      logEvent("info", "relay-broker-started");
    } catch (err) {
      logEvent("warn", "relay-broker-start-failed", {
        error: errorMessage(err),
      });
      this.available = false;
      this.adapter = null;
    }
  }

  /**
   * Subscribe to agent.pty.input events and forward to relay adapter.
   */
  private subscribeToPtyInput(): () => void {
    const handler = (payload: { name: string; chatId?: string; data: string }) => {
      if (!this.adapter) return;
      const relayName = payload.chatId ? buildRelaySessionName(payload.name, payload.chatId) : payload.name;
      this.adapter.sendInput(relayName, payload.data).catch((err) => {
        logEvent("error", "relay-pty-input-failed", {
          name: relayName,
          error: errorMessage(err),
        });
      });
    };

    this.eventBus.on("agent.pty.input", handler);
    return () => this.eventBus.off("agent.pty.input", handler);
  }

  /**
   * Stop the relay broker gracefully.
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }

    if (this.inputUnsubscribe) {
      this.inputUnsubscribe();
      this.inputUnsubscribe = null;
    }

    if (this.adapter) {
      try {
        await this.adapter.shutdown();
      } catch (err) {
        logEvent("warn", "relay-broker-shutdown-error", {
          error: errorMessage(err),
        });
      }
      this.adapter = null;
    }

    this.started = false;
    this.available = false;
    logEvent("info", "relay-broker-stopped");
  }

  /**
   * Spawn an agent in PTY mode via the broker.
   */
  async spawnAgent(params: {
    name: string;
    cli: string;
    task?: string;
    cwd?: string;
    model?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.adapter || !this.available) {
      return { success: false, error: "Relay broker not available" };
    }

    try {
      const result = await this.adapter.spawn({
        name: params.name,
        cli: params.cli,
        task: params.task,
        cwd: params.cwd,
        model: params.model,
        interactive: true,
      });
      return { success: result.success, error: result.error };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  /**
   * Release (stop) a relay agent.
   */
  async releaseAgent(name: string, reason?: string): Promise<void> {
    if (!this.adapter) return;

    try {
      await this.adapter.release(name, reason);
    } catch (err) {
      logEvent("warn", "relay-agent-release-failed", {
        name,
        error: errorMessage(err),
      });
    }
  }

  /**
   * Send raw input to an agent's PTY stdin.
   */
  async sendInput(name: string, data: string): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.sendInput(name, data);
  }

  /**
   * Send a message to an agent via the relay broker.
   * Used for injecting envelope content into a running PTY session.
   */
  async sendMessage(params: {
    to: string;
    text: string;
    from?: string;
  }): Promise<void> {
    if (!this.adapter) return;

    try {
      await this.adapter.sendMessage({
        to: params.to,
        text: params.text,
        from: params.from,
      });
    } catch (err) {
      logEvent("error", "relay-send-message-failed", {
        to: params.to,
        error: errorMessage(err),
      });
    }
  }

  /**
   * Check if a specific agent is running in relay mode.
   */
  async hasAgent(name: string): Promise<boolean> {
    if (!this.adapter) return false;
    try {
      return await this.adapter.hasAgent(name);
    } catch {
      return false;
    }
  }

  /**
   * Interrupt an agent (ESC ESC sequence).
   */
  async interruptAgent(name: string): Promise<boolean> {
    if (!this.adapter) return false;
    try {
      return await this.adapter.interruptAgent(name);
    } catch {
      return false;
    }
  }
}
