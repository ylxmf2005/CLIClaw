/**
 * Daemon event bus for real-time event distribution.
 *
 * Central EventEmitter that decouples event production from WebSocket transport.
 * Existing daemon code emits typed events through this bus; the WS server subscribes
 * and broadcasts to connected clients.
 */

import { EventEmitter } from "node:events";
import type { Envelope } from "../../envelope/types.js";
import type { MessageContent, SendMessageOptions } from "../../adapters/types.js";

// ==================== Event Payload Types ====================

export interface EnvelopeNewPayload {
  envelope: Envelope;
}

export interface EnvelopeDonePayload {
  id: string;
}

export interface AgentStatusPayload {
  name: string;
  agentState: "running" | "idle";
  agentHealth: "ok" | "error" | "unknown";
  currentRun?: { id: string; startedAt: number };
  lastRun?: {
    id: string;
    startedAt: number;
    completedAt?: number;
    status: "completed" | "failed" | "cancelled";
    error?: string;
    contextLength?: number;
  };
}

export interface AgentRegisteredPayload {
  name: string;
  description?: string;
  provider?: "claude" | "codex";
}

export interface AgentDeletedPayload {
  name: string;
}

export interface AgentLogPayload {
  name: string;
  chatId?: string;
  line: string;
}

export interface RunStartedPayload {
  runId: string;
  agentName: string;
  startedAt: number;
}

export interface RunCompletedPayload {
  runId: string;
  agentName: string;
  completedAt: number;
  status: "completed" | "failed" | "cancelled";
  error?: string;
  contextLength?: number;
}

export interface AgentPtyOutputPayload {
  name: string;
  chatId?: string;
  data: string;
}

export interface AgentPtyInputPayload {
  name: string;
  chatId?: string;
  data: string;
}

export interface ConsoleMessagePayload {
  chatId: string;
  content: MessageContent;
  options?: SendMessageOptions;
  envelope: Envelope;
}

// ==================== Event Map ====================

export interface DaemonEventMap {
  "envelope.new": EnvelopeNewPayload;
  "envelope.done": EnvelopeDonePayload;
  "agent.status": AgentStatusPayload;
  "agent.registered": AgentRegisteredPayload;
  "agent.deleted": AgentDeletedPayload;
  "agent.log": AgentLogPayload;
  "run.started": RunStartedPayload;
  "run.completed": RunCompletedPayload;
  "agent.pty.output": AgentPtyOutputPayload;
  "agent.pty.input": AgentPtyInputPayload;
  "console.message": ConsoleMessagePayload;
}

export type DaemonEventType = keyof DaemonEventMap;

// ==================== Event Bus ====================

/**
 * Typed event bus for daemon-internal events.
 *
 * Usage:
 *   bus.emit("envelope.new", { envelope });
 *   bus.on("envelope.new", (payload) => { ... });
 */
export class DaemonEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many WS client subscriptions without warning
    this.emitter.setMaxListeners(100);
  }

  emit<K extends DaemonEventType>(event: K, payload: DaemonEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends DaemonEventType>(
    event: K,
    listener: (payload: DaemonEventMap[K]) => void,
  ): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends DaemonEventType>(
    event: K,
    listener: (payload: DaemonEventMap[K]) => void,
  ): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Subscribe to all event types with a single handler.
   * Returns an unsubscribe function.
   */
  onAll(handler: (event: DaemonEventType, payload: unknown) => void): () => void {
    const eventTypes: DaemonEventType[] = [
      "envelope.new",
      "envelope.done",
      "agent.status",
      "agent.registered",
      "agent.deleted",
      "agent.log",
      "run.started",
      "run.completed",
      "agent.pty.output",
      "agent.pty.input",
      "console.message",
    ];

    const listeners = new Map<string, (...args: unknown[]) => void>();
    for (const eventType of eventTypes) {
      const listener = (payload: unknown) => handler(eventType, payload);
      this.emitter.on(eventType, listener);
      listeners.set(eventType, listener);
    }

    return () => {
      for (const [eventType, listener] of listeners) {
        this.emitter.off(eventType, listener);
      }
    };
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
