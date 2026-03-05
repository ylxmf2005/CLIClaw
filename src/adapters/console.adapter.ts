/**
 * Console adapter for the web management console.
 *
 * Routes outbound agent messages through the DaemonEventBus as "console.message"
 * events, which the WebSocket server broadcasts to connected web clients.
 *
 * Inbound messages from the web console are sent as envelopes via the HTTP API,
 * so this adapter does not handle incoming messages.
 */

import type {
  ChatAdapter,
  ChannelMessageHandler,
  MessageContent,
  SendMessageOptions,
} from "./types.js";
import type { DaemonEventBus } from "../daemon/events/event-bus.js";

export const CONSOLE_ADAPTER_TOKEN = "__console_adapter__";

export interface ConsoleAdapterOptions {
  eventBus: DaemonEventBus;
}

/**
 * Console chat adapter.
 *
 * - `platform`: `"console"`
 * - `sendMessage()`: emits `"console.message"` on the event bus
 * - `start()` / `stop()`: no-ops
 * - Does not handle incoming messages or commands
 */
export class ConsoleAdapter implements ChatAdapter {
  readonly platform = "console";
  private eventBus: DaemonEventBus;

  constructor(options: ConsoleAdapterOptions) {
    this.eventBus = options.eventBus;
  }

  async sendMessage(
    chatId: string,
    content: MessageContent,
    options?: SendMessageOptions,
  ): Promise<void> {
    if (!options?.envelope) {
      // Console real-time delivery expects the originating envelope.
      // Skip emitting partial payloads to avoid inconsistent UI state.
      return;
    }
    this.eventBus.emit("console.message", {
      chatId,
      content,
      options,
      envelope: options.envelope,
    });
  }

  onMessage(_handler: ChannelMessageHandler): void {
    // No-op: web console sends envelopes directly via HTTP
  }

  async start(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    // No-op
  }
}
