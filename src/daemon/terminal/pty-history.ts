import * as fs from "node:fs";
import * as path from "node:path";

import { errorMessage, logEvent } from "../../shared/daemon-log.js";

const PTY_HISTORY_ROOT_DIRNAME = "pty_history";

type PtyHistoryDirection = "input" | "output";

export interface PtyHistoryEvent {
  timestampMs: number;
  direction: PtyHistoryDirection;
  data: string;
}

const appendQueues = new Map<string, Promise<void>>();

function encodePathSegment(raw: string): string {
  const value = raw.trim();
  if (!value) return "_";
  return encodeURIComponent(value);
}

function getPtyHistoryFilePath(cliclawDir: string, agentName: string, chatId: string): string {
  const encodedAgent = encodePathSegment(agentName);
  const encodedChat = encodePathSegment(chatId);
  return path.join(
    cliclawDir,
    ".daemon",
    PTY_HISTORY_ROOT_DIRNAME,
    encodedAgent,
    `${encodedChat}.jsonl`,
  );
}

function enqueueAppend(filePath: string, line: string): void {
  const previous = appendQueues.get(filePath) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.appendFile(filePath, line, "utf8");
    })
    .catch((err) => {
      logEvent("warn", "pty-history-append-failed", {
        "file-path": filePath,
        error: errorMessage(err),
      });
    })
    .finally(() => {
      if (appendQueues.get(filePath) === next) {
        appendQueues.delete(filePath);
      }
    });

  appendQueues.set(filePath, next);
}

export function appendPtyHistoryEvent(params: {
  cliclawDir: string;
  agentName: string;
  chatId?: string;
  direction: PtyHistoryDirection;
  data: string;
  timestampMs?: number;
}): void {
  const chatId = params.chatId?.trim();
  if (!chatId) return;
  if (!params.data) return;

  const record: PtyHistoryEvent = {
    timestampMs: params.timestampMs ?? Date.now(),
    direction: params.direction,
    data: params.data,
  };

  const filePath = getPtyHistoryFilePath(
    params.cliclawDir,
    params.agentName,
    chatId,
  );
  enqueueAppend(filePath, `${JSON.stringify(record)}\n`);
}

export function readPtyHistoryEvents(params: {
  cliclawDir: string;
  agentName: string;
  chatId: string;
  limit?: number;
}): PtyHistoryEvent[] {
  const chatId = params.chatId.trim();
  if (!chatId) return [];

  const filePath = getPtyHistoryFilePath(params.cliclawDir, params.agentName, chatId);
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const parsed: PtyHistoryEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed) as Partial<PtyHistoryEvent>;
      if (
        (value.direction === "input" || value.direction === "output")
        && typeof value.data === "string"
        && typeof value.timestampMs === "number"
      ) {
        parsed.push({
          direction: value.direction,
          data: value.data,
          timestampMs: value.timestampMs,
        });
      }
    } catch {
      // Ignore malformed lines to keep history resilient.
    }
  }

  const limit = Number.isFinite(params.limit)
    ? Math.max(1, Math.min(10_000, Math.trunc(params.limit as number)))
    : 2000;

  if (parsed.length <= limit) return parsed;
  return parsed.slice(parsed.length - limit);
}

export function readPtyOutputChunks(params: {
  cliclawDir: string;
  agentName: string;
  chatId: string;
  limit?: number;
}): string[] {
  return readPtyHistoryEvents(params)
    .filter((event) => event.direction === "output")
    .map((event) => event.data);
}

export async function flushPtyHistoryWritesForTest(): Promise<void> {
  await Promise.all([...appendQueues.values()]);
}
