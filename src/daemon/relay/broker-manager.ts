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
import { execSync } from "node:child_process";
import { openSync, writeSync, closeSync } from "node:fs";

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
  /** Project directory for the broker (usually cliclaw data dir). */
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

  /**
   * Map of relay agent name → TTY device path for direct PTY input.
   *
   * The broker binary's `send_input` RPC is broken for PTY workers: it writes
   * raw bytes to the worker subprocess stdin, but the PTY worker expects JSON
   * protocol frames, causing `invalid_frame` errors. As a workaround, we
   * discover the child process's TTY slave device after spawn and write
   * keystrokes there directly.
   */
  private agentTtyPaths = new Map<string, string>();
  /** Map of relay agent name → PTY worker PID (returned by spawn). */
  private agentPtyWorkerPids = new Map<string, number>();

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
        clientName: "cliclaw-daemon",
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
      this.sendInput(relayName, payload.data).catch((err) => {
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
    this.agentTtyPaths.clear();
    this.agentPtyWorkerPids.clear();
    logEvent("info", "relay-broker-stopped");
  }

  /**
   * Discover the TTY device path for a PTY worker's child process.
   * The PTY worker (agent-relay-broker pty) spawns the CLI tool as a child
   * process with a PTY slave device. We find that device to write input
   * directly.
   */
  private discoverChildTty(ptyWorkerPid: number, agentName: string, retries = 5): void {
    const attempt = () => {
      try {
        const childrenRaw = execSync(`pgrep -P ${ptyWorkerPid} 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 3000,
        }).trim();
        if (!childrenRaw) return false;

        // Take the first child process
        const childPid = childrenRaw.split("\n")[0].trim();
        const tty = execSync(`ps -o tty= -p ${childPid} 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 3000,
        }).trim();

        if (tty && tty !== "??" && tty !== "?") {
          const ttyPath = `/dev/${tty}`;
          this.agentTtyPaths.set(agentName, ttyPath);
          logEvent("info", "relay-tty-discovered", {
            name: agentName,
            tty: ttyPath,
            "child-pid": childPid,
          });
          return true;
        }
      } catch {
        // Process may not be ready yet
      }
      return false;
    };

    // Try immediately, then retry with delays
    if (attempt()) return;

    let remaining = retries;
    const timer = setInterval(() => {
      remaining--;
      if (attempt() || remaining <= 0) {
        clearInterval(timer);
        if (remaining <= 0 && !this.agentTtyPaths.has(agentName)) {
          logEvent("warn", "relay-tty-discovery-failed", {
            name: agentName,
            "pty-worker-pid": ptyWorkerPid,
          });
        }
      }
    }, 500);
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

      if (result.success && result.pid) {
        this.agentPtyWorkerPids.set(params.name, result.pid);
        // Discover the child process TTY in the background
        this.discoverChildTty(result.pid, params.name);
      }

      return { success: result.success, error: result.error };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  /**
   * Release (stop) a relay agent.
   */
  async releaseAgent(name: string, reason?: string): Promise<void> {
    this.agentTtyPaths.delete(name);
    this.agentPtyWorkerPids.delete(name);

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
   *
   * Uses direct TTY device write instead of the broker's broken `send_input`
   * RPC. Falls back to `adapter.sendInput()` if TTY path is not yet known.
   */
  async sendInput(name: string, data: string): Promise<void> {
    const ttyPath = this.agentTtyPaths.get(name);
    if (ttyPath) {
      try {
        const fd = openSync(ttyPath, "w");
        try {
          writeSync(fd, data);
        } finally {
          closeSync(fd);
        }
        return;
      } catch (err) {
        logEvent("warn", "relay-tty-write-failed", {
          name,
          tty: ttyPath,
          error: errorMessage(err),
        });
        // TTY may have been invalidated; clear and re-discover
        this.agentTtyPaths.delete(name);
        const pid = this.agentPtyWorkerPids.get(name);
        if (pid) {
          this.discoverChildTty(pid, name, 2);
        }
      }
    }

    // Fallback to SDK (known broken for PTY workers, but try anyway)
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
    // Try direct TTY write first (sends ESC ESC)
    const ttyPath = this.agentTtyPaths.get(name);
    if (ttyPath) {
      try {
        const fd = openSync(ttyPath, "w");
        try {
          writeSync(fd, "\x1b\x1b");
        } finally {
          closeSync(fd);
        }
        return true;
      } catch {
        // Fall through to SDK
      }
    }
    if (!this.adapter) return false;
    try {
      return await this.adapter.interruptAgent(name);
    } catch {
      return false;
    }
  }
}
