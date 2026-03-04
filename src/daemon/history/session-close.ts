/**
 * Session close helpers.
 *
 * Session close marks endedAtMs and updates markdown summary state.
 */

import type { ConversationHistory } from "./conversation-history.js";
import {
  clearSessionJournal,
  closeSessionFile,
  readSessionFile,
  readSessionJournalEvents,
  writeSessionFile,
} from "./session-file-io.js";
import { markSessionMarkdownClosedBySessionJsonPath } from "./session-markdown-file-io.js";
import type { SessionHistoryEvent } from "./types.js";
import { errorMessage, logEvent } from "../../shared/daemon-log.js";

export function closeSessionByPath(params: {
  filePath: string;
  agentName: string;
  endedAtMs?: number;
  timeZone: string;
  history?: ConversationHistory;
}): void {
  const endedAtMs = params.endedAtMs ?? Date.now();
  const finalized = params.history?.finalizeActiveSessionByFilePath(
    params.agentName,
    params.filePath,
    endedAtMs,
  ) ?? false;

  if (!finalized) {
    const session = readSessionFile(params.filePath);
    const journalEvents = readSessionJournalEvents(params.filePath);
    if (session && journalEvents.length > 0) {
      const mergedEvents = mergeSessionEvents([session.events, journalEvents]);
      const endedAt = session.endedAtMs === null ? endedAtMs : session.endedAtMs;
      writeSessionFile(params.filePath, {
        ...session,
        events: mergedEvents,
        endedAtMs: endedAt,
      });
      clearSessionJournal(params.filePath);
    }
    closeSessionFile(params.filePath, endedAtMs);
    markSessionMarkdownClosedBySessionJsonPath({
      sessionJsonPath: params.filePath,
      endedAtMs,
      timeZone: params.timeZone,
    });
  }

  logEvent("info", "session-closed", {
    "agent-name": params.agentName,
    "file-path": params.filePath,
    finalized,
  });
}

function mergeSessionEvents(streams: SessionHistoryEvent[][]): SessionHistoryEvent[] {
  const merged: SessionHistoryEvent[] = [];
  const seen = new Set<string>();
  for (const stream of streams) {
    for (const event of stream) {
      const key = JSON.stringify(event);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  }
  return merged;
}

export function closeActiveSession(params: {
  history: ConversationHistory;
  agentName: string;
  chatId?: string | null;
  endedAtMs?: number;
}): void {
  const endedAtMs = params.endedAtMs ?? Date.now();
  const timeZone = params.history.getTimezone();

  if (params.chatId !== undefined && params.chatId !== null) {
    const filePath = params.history.getCurrentSessionFilePath(params.agentName, params.chatId);
    if (filePath) {
      closeSessionByPath({
        filePath,
        agentName: params.agentName,
        endedAtMs,
        timeZone,
        history: params.history,
      });
    }
    params.history.clearActiveSession(params.agentName, params.chatId);
    return;
  }

  const filePathSet = new Set<string>(params.history.getCurrentSessionFilePaths(params.agentName));
  const fallbackPath = params.history.getCurrentSessionFilePath(params.agentName);
  if (fallbackPath) {
    filePathSet.add(fallbackPath);
  }

  for (const filePath of filePathSet) {
    closeSessionByPath({
      filePath,
      agentName: params.agentName,
      endedAtMs,
      timeZone,
      history: params.history,
    });
  }

  params.history.clearActiveSession(params.agentName);
}

export function closeAllActiveSessions(params: {
  history: ConversationHistory;
  agentNames: string[];
  endedAtMs?: number;
}): void {
  for (const agentName of params.agentNames) {
    try {
      closeActiveSession({
        history: params.history,
        agentName,
        endedAtMs: params.endedAtMs,
      });
    } catch (err) {
      logEvent("warn", "session-close-failed", {
        "agent-name": agentName,
        error: errorMessage(err),
      });
    }
  }
}
