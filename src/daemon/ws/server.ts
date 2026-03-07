/**
 * Daemon WebSocket server.
 *
 * Runs on the same HTTP server (upgrade path). Handles:
 * - Token auth on connect (query param `?token=...`)
 * - Client connection management
 * - Snapshot event on connect
 * - Event broadcasting from DaemonEventBus
 * - Agent log line batching (10 lines max, 100ms debounce)
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { DaemonContext } from "../rpc/context.js";
import type { DaemonEventBus, DaemonEventType } from "../events/event-bus.js";
import { logEvent, errorMessage } from "../../shared/daemon-log.js";

const WS_AUTH_CLOSE_CODE = 4001;
const LOG_BATCH_MAX = 10;
const LOG_BATCH_DEBOUNCE_MS = 100;

interface LogBatch {
  lines: Array<{ name: string; chatId?: string; line: string }>;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Create and wire the WebSocket server.
 */
export function createWsServer(
  httpServer: HttpServer,
  daemonCtx: DaemonContext,
  eventBus: DaemonEventBus,
): { cleanup: () => void } {
  const wss = new WebSocketServer({ noServer: true });
  const logBatches = new Map<WebSocket, LogBatch>();

  // Handle HTTP upgrade
  httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token");
    if (!token || !daemonCtx.db.verifyAdminToken(token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    logBatches.set(ws, { lines: [], timer: null });

    // Send snapshot on connect
    sendSnapshot(ws, daemonCtx);

    // Handle incoming messages (currently only agent.pty.input)
    ws.on("message", (raw) => {
      void handleInboundMessage(ws, raw, daemonCtx, eventBus);
    });

    ws.on("close", () => {
      const batch = logBatches.get(ws);
      if (batch?.timer) clearTimeout(batch.timer);
      logBatches.delete(ws);
    });

    ws.on("error", (err) => {
      logEvent("error", "ws-client-error", { error: errorMessage(err) });
    });
  });

  // Subscribe to all events from the bus
  const unsubscribe = eventBus.onAll((event, payload) => {
    if (event === "agent.log") {
      // Batch log lines
      for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        batchLogLine(client, payload as { name: string; chatId?: string; line: string }, logBatches);
      }
      return;
    }

    // Broadcast non-log events immediately
    const message = JSON.stringify({
      type: event,
      payload,
      timestamp: Date.now(),
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  const cleanup = () => {
    unsubscribe();
    for (const [, batch] of logBatches) {
      if (batch.timer) clearTimeout(batch.timer);
    }
    logBatches.clear();
    wss.close();
  };

  return { cleanup };
}

async function handleInboundMessage(
  ws: WebSocket,
  raw: unknown,
  daemonCtx: DaemonContext,
  eventBus: DaemonEventBus,
): Promise<void> {
  try {
    const msg = JSON.parse(String(raw)) as {
      type?: string;
      payload?: { name?: string; chatId?: string; data?: string };
    };

    if (msg.type !== "agent.pty.input" || !msg.payload?.name || !msg.payload?.data) {
      return;
    }

    const { name, chatId, data } = msg.payload;

    // For chat-bound PTY sessions, route through RelayExecutor so we can
    // self-heal stale in-memory relay session state after daemon restarts.
    if (chatId && daemonCtx.relayExecutor) {
      const result = await daemonCtx.relayExecutor.sendInput(name, chatId, data);
      if (!result.success) {
        sendPtyErrorToClient(ws, name, chatId, result.error ?? "Relay input failed");
      }
      return;
    }

    // Backward-compatible passthrough for non-chat PTY streams.
    eventBus.emit("agent.pty.input", {
      name,
      chatId,
      data,
    });
  } catch {
    // Ignore malformed messages
  }
}

function sendPtyErrorToClient(
  ws: WebSocket,
  agentName: string,
  chatId: string,
  error: string,
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "agent.pty.output",
    payload: {
      name: agentName,
      chatId,
      data: `\r\n[relay input failed: ${error}]\r\n`,
    },
    timestamp: Date.now(),
  }));
}

function sendSnapshot(ws: WebSocket, ctx: DaemonContext): void {
  try {
    const agents = ctx.db.listAgents();
    const bindings = ctx.db.listBindings();

    const agentStatuses = agents.map((agent) => ({
      name: agent.name,
      agentState: ctx.executor.isAgentBusy(agent.name) ? "running" : "idle",
    }));

    const snapshot = {
      type: "snapshot",
      payload: {
        agents: agents.map((a) => ({
          name: a.name,
          description: a.description,
          provider: a.provider,
          relayMode: a.relayMode,
          bindings: bindings
            .filter((b) => b.agentName === a.name)
            .map((b) => b.adapterType),
        })),
        agentStatuses,
        daemon: {
          running: ctx.running,
          startTimeMs: ctx.startTimeMs,
          adapters: Array.from(ctx.adapters.values()).map((a) => a.platform),
        },
      },
      timestamp: Date.now(),
    };

    ws.send(JSON.stringify(snapshot));
  } catch (err) {
    logEvent("error", "ws-snapshot-error", { error: errorMessage(err) });
  }
}

function batchLogLine(
  ws: WebSocket,
  payload: { name: string; chatId?: string; line: string },
  batches: Map<WebSocket, LogBatch>,
): void {
  let batch = batches.get(ws);
  if (!batch) {
    batch = { lines: [], timer: null };
    batches.set(ws, batch);
  }

  batch.lines.push(payload);

  if (batch.lines.length >= LOG_BATCH_MAX) {
    flushLogBatch(ws, batch);
    return;
  }

  if (!batch.timer) {
    batch.timer = setTimeout(() => {
      flushLogBatch(ws, batch!);
    }, LOG_BATCH_DEBOUNCE_MS);
  }
}

function flushLogBatch(ws: WebSocket, batch: LogBatch): void {
  if (batch.timer) {
    clearTimeout(batch.timer);
    batch.timer = null;
  }

  if (batch.lines.length === 0) return;

  const lines = batch.lines.splice(0);

  if (ws.readyState !== WebSocket.OPEN) return;

  const message = JSON.stringify({
    type: "agent.log",
    payload: { lines },
    timestamp: Date.now(),
  });
  ws.send(message);
}
