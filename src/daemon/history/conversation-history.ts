/**
 * Conversation history — appends envelope lifecycle events to per-session
 * journal files, periodically compacts to JSON during active sessions, and
 * finalizes JSON/Markdown files when a session is closed.
 *
 * Layout:
 *   {{agentsDir}}/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<sessionId>.json
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { Envelope, EnvelopeOrigin } from "../../envelope/types.js";
import { parseAddress } from "../../adapters/types.js";
import { logEvent, errorMessage } from "../../shared/daemon-log.js";
import { formatShortId } from "../../shared/id-format.js";
import { formatUnixMsAsTimeZoneOffset } from "../../shared/time.js";
import {
  buildInitialSessionHistoryFrontmatter,
  type SessionHistoryMarkdownDocument,
} from "../../shared/session-history-markdown.js";
import type { SessionFile, SessionStatusChangeInput, SessionHistoryEvent } from "./types.js";
import { SESSION_FILE_VERSION } from "./types.js";
import {
  DEFAULT_HISTORY_CHAT_DIR,
  normalizeHistoryChatDir,
  resolveEnvelopeChatId,
} from "./chat-scope-path.js";
import {
  appendSessionJournalEvent,
  clearSessionJournal,
  createSessionFile,
  readSessionFile,
  listSessionFiles,
  readSessionJournalEvents,
  writeSessionFile,
} from "./session-file-io.js";
import {
  buildSessionMarkdownBodyFromEvents,
  getSessionMarkdownPath,
  writeSessionMarkdownFile,
} from "./session-markdown-file-io.js";

export interface ConversationHistoryOptions {
  agentsDir: string;
  timezone?: string;
}

const JOURNAL_COMPACT_EVENT_THRESHOLD = 50;
const JOURNAL_COMPACT_INTERVAL_MS = 30_000;

type ActiveHistorySession = {
  sessionId: string;
  dateStr: string;
  chatDir: string;
  startedAtMs: number;
  updatedAtMs: number;
  pendingEvents: SessionHistoryEvent[];
  journalEventsSinceCompact: number;
  lastCompactedAtMs: number;
};

export class ConversationHistory {
  private agentsDir: string;
  private timezone: string;
  /** Active session registry by agent -> chat-dir -> session info. */
  private activeSessionsByAgent: Map<string, Map<string, ActiveHistorySession>> = new Map();

  constructor(options: ConversationHistoryOptions) {
    this.agentsDir = options.agentsDir;
    this.timezone = options.timezone ?? "UTC";
  }

  setTimezone(timezone: string): void {
    this.timezone = timezone;
  }

  appendEnvelopeCreated(params: {
    envelope: Envelope;
    origin: EnvelopeOrigin;
    timestampMs?: number;
  }): void {
    try {
      const { envelope } = params;
      const participants = this.resolveParticipantAgentNames(envelope);
      if (participants.length === 0) return;

      const event: SessionHistoryEvent = {
        type: "envelope-created",
        timestampMs: params.timestampMs ?? envelope.createdAt,
        origin: params.origin,
        envelope,
      };

      this.appendEventForAgents(participants, event, envelope);
    } catch (err) {
      logEvent("error", "history-append-failed", {
        "envelope-id": params.envelope.id,
        error: errorMessage(err),
      });
    }
  }

  appendStatusChange(input: SessionStatusChangeInput): void {
    try {
      const participants = this.resolveParticipantAgentNames(input.envelope);
      if (participants.length === 0) return;

      const event: SessionHistoryEvent = {
        type: "envelope-status-changed",
        timestampMs: input.timestampMs,
        origin: input.origin,
        envelopeId: input.envelope.id,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        outcome: input.outcome,
      };

      this.appendEventForAgents(participants, event, input.envelope);
    } catch (err) {
      logEvent("error", "history-status-append-failed", {
        "envelope-id": input.envelope.id,
        error: errorMessage(err),
      });
    }
  }

  /**
   * Start a new history session for an agent. Returns the new session ID.
   * Called by the executor when creating a new session.
   */
  startSession(agentName: string, chatId?: string): string {
    try {
      const sessionId = formatShortId(crypto.randomUUID());
      const now = Date.now();
      const dateStr = this.getDateString(now);
      const chatDir = normalizeHistoryChatDir(chatId);
      const filePath = this.buildSessionFilePath(agentName, dateStr, chatDir, sessionId);

      createSessionFile({
        filePath,
        sessionId,
        agentName,
        startedAtMs: now,
      });

      this.setActiveSession(agentName, chatDir, {
        sessionId,
        dateStr,
        chatDir,
        startedAtMs: now,
        updatedAtMs: now,
        pendingEvents: [],
        journalEventsSinceCompact: 0,
        lastCompactedAtMs: now,
      });

      return sessionId;
    } catch (err) {
      logEvent("error", "history-session-mark-failed", {
        "agent-name": agentName,
        error: errorMessage(err),
      });
      // Return a fallback ID so callers don't crash.
      const fallbackId = formatShortId(crypto.randomUUID());
      const now = Date.now();
      this.setActiveSession(agentName, DEFAULT_HISTORY_CHAT_DIR, {
        sessionId: fallbackId,
        dateStr: this.getDateString(now),
        chatDir: DEFAULT_HISTORY_CHAT_DIR,
        startedAtMs: now,
        updatedAtMs: now,
        pendingEvents: [],
        journalEventsSinceCompact: 0,
        lastCompactedAtMs: now,
      });
      return fallbackId;
    }
  }

  /**
   * Get current session ID for an agent (optionally scoped to chat).
   */
  getCurrentSessionId(agentName: string, chatId?: string | null): string | null {
    if (chatId !== undefined && chatId !== null) {
      const chatDir = normalizeHistoryChatDir(chatId);
      return this.getActiveSession(agentName, chatDir)?.sessionId ?? null;
    }
    return this.getMostRecentActiveSession(agentName)?.sessionId ?? null;
  }

  /**
   * Get the full file path for a session.
   */
  getSessionFilePath(agentName: string, sessionId: string, dateStr: string, chatId?: string): string {
    return this.buildSessionFilePath(
      agentName,
      dateStr,
      normalizeHistoryChatDir(chatId),
      sessionId,
    );
  }

  /**
   * Get the file path for the current active session.
   * Returns null if no active session.
   */
  getCurrentSessionFilePath(agentName: string, chatId?: string | null): string | null {
    if (chatId !== undefined && chatId !== null) {
      const chatDir = normalizeHistoryChatDir(chatId);
      return this.getActiveSessionFilePathByChatDir(agentName, chatDir);
    }
    const latest = this.getMostRecentActiveSession(agentName);
    if (!latest) return null;
    return this.buildSessionFilePath(agentName, latest.dateStr, latest.chatDir, latest.sessionId);
  }

  /**
   * Get file paths for all active sessions currently tracked for an agent.
   */
  getCurrentSessionFilePaths(agentName: string): string[] {
    const scoped = this.activeSessionsByAgent.get(agentName);
    if (!scoped || scoped.size === 0) return [];
    return [...scoped.values()]
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .map((item) => this.buildSessionFilePath(agentName, item.dateStr, item.chatDir, item.sessionId));
  }

  getTimezone(): string {
    return this.timezone;
  }

  /**
   * Flush pending in-memory events and mark an active session as ended.
   * Returns false when the path is not currently an active session.
   */
  finalizeActiveSessionByFilePath(agentName: string, filePath: string, endedAtMs: number): boolean {
    const scoped = this.activeSessionsByAgent.get(agentName);
    if (!scoped || scoped.size === 0) return false;

    for (const active of scoped.values()) {
      const activePath = this.buildSessionFilePath(agentName, active.dateStr, active.chatDir, active.sessionId);
      if (activePath !== filePath) continue;
      this.flushAndCloseSession(agentName, active, endedAtMs);
      return true;
    }

    return false;
  }

  /**
   * Clear the active session tracking for an agent (optionally scoped to chat) after close.
   */
  clearActiveSession(agentName: string, chatId?: string | null): void {
    const scoped = this.activeSessionsByAgent.get(agentName);
    if (!scoped) return;
    if (chatId === undefined || chatId === null) {
      this.activeSessionsByAgent.delete(agentName);
      return;
    }
    scoped.delete(normalizeHistoryChatDir(chatId));
    if (scoped.size === 0) {
      this.activeSessionsByAgent.delete(agentName);
    }
  }

  // -- Internals --

  private appendEventForAgents(
    agentNames: string[],
    event: SessionHistoryEvent,
    envelopeForScope?: Envelope,
  ): void {
    const preferredChatId = envelopeForScope ? resolveEnvelopeChatId(envelopeForScope) : null;
    const preferredChatDir = normalizeHistoryChatDir(preferredChatId);

    for (const agentName of agentNames) {
      this.ensureActiveSession(agentName, preferredChatId);
      let active = this.getActiveSession(agentName, preferredChatDir);
      if (!active) {
        // Ensure scope-specific session exists even if a broad recover found another chat scope.
        this.startSession(agentName, preferredChatId ?? undefined);
        active = this.getActiveSession(agentName, preferredChatDir);
      }
      if (!active) continue;
      const filePath = this.buildSessionFilePath(agentName, active.dateStr, active.chatDir, active.sessionId);
      try {
        appendSessionJournalEvent(filePath, event);
      } catch (err) {
        logEvent("warn", "history-session-journal-append-failed", {
          "agent-name": agentName,
          "session-id": active.sessionId,
          error: errorMessage(err),
        });
        // Fallback buffer: retained only when journal append fails.
        active.pendingEvents.push(event);
      }
      active.journalEventsSinceCompact += 1;
      this.maybeCompactActiveSession(agentName, active);
      active.updatedAtMs = Math.max(active.updatedAtMs, event.timestampMs);
    }
  }

  private flushAndCloseSession(agentName: string, active: ActiveHistorySession, endedAtMs: number): void {
    const sessionFile = this.compactSessionFile({
      agentName,
      active,
      endedAtMs,
      closeSession: true,
    });
    if (!sessionFile || sessionFile.endedAtMs === null) return;

    const endedAt = sessionFile.endedAtMs;
    const filePath = this.buildSessionFilePath(agentName, active.dateStr, active.chatDir, active.sessionId);
    const markdownPath = getSessionMarkdownPath(filePath);
    const markdownDoc: SessionHistoryMarkdownDocument = {
      frontmatter: buildInitialSessionHistoryFrontmatter({
        sessionId: sessionFile.sessionId,
        agentName,
        startedAtMs: sessionFile.startedAtMs,
        timeZone: this.timezone,
      }),
      body: buildSessionMarkdownBodyFromEvents(sessionFile.events, this.timezone),
    };
    markdownDoc.frontmatter.endedAt = formatUnixMsAsTimeZoneOffset(endedAt, this.timezone);
    markdownDoc.frontmatter.summaryStatus = "pending";
    markdownDoc.frontmatter.summaryUpdatedAt = formatUnixMsAsTimeZoneOffset(Date.now(), this.timezone);

    writeSessionMarkdownFile(markdownPath, markdownDoc);
    active.updatedAtMs = Math.max(active.updatedAtMs, endedAtMs);
  }

  private maybeCompactActiveSession(agentName: string, active: ActiveHistorySession): void {
    const now = Date.now();
    const dueToCount = active.journalEventsSinceCompact >= JOURNAL_COMPACT_EVENT_THRESHOLD;
    const dueToTime = now - active.lastCompactedAtMs >= JOURNAL_COMPACT_INTERVAL_MS;
    if (!dueToCount && !dueToTime) return;

    try {
      this.compactSessionFile({
        agentName,
        active,
        closeSession: false,
      });
    } catch (err) {
      logEvent("warn", "history-session-compact-failed", {
        "agent-name": agentName,
        "session-id": active.sessionId,
        error: errorMessage(err),
      });
    }
  }

  private compactSessionFile(params: {
    agentName: string;
    active: ActiveHistorySession;
    closeSession: boolean;
    endedAtMs?: number;
  }): SessionFile | null {
    const filePath = this.buildSessionFilePath(
      params.agentName,
      params.active.dateStr,
      params.active.chatDir,
      params.active.sessionId,
    );
    const existing = readSessionFile(filePath);
    const journalEvents = readSessionJournalEvents(filePath);
    if (!params.closeSession && journalEvents.length === 0 && params.active.pendingEvents.length === 0) {
      params.active.journalEventsSinceCompact = 0;
      params.active.lastCompactedAtMs = Date.now();
      return existing;
    }

    const mergedEvents = this.mergeSessionEvents([
      existing?.events ?? [],
      journalEvents,
      params.active.pendingEvents,
    ]);

    const endedAt = params.closeSession
      ? (
          typeof existing?.endedAtMs === "number" && Number.isFinite(existing.endedAtMs)
            ? existing.endedAtMs
            : (params.endedAtMs ?? Date.now())
        )
      : (existing?.endedAtMs ?? null);

    const sessionFile: SessionFile = {
      version: SESSION_FILE_VERSION,
      sessionId: params.active.sessionId,
      agentName: params.agentName,
      startedAtMs: existing?.startedAtMs ?? params.active.startedAtMs,
      endedAtMs: endedAt,
      events: mergedEvents,
    };

    writeSessionFile(filePath, sessionFile);
    clearSessionJournal(filePath);
    params.active.pendingEvents = [];
    params.active.journalEventsSinceCompact = 0;
    params.active.lastCompactedAtMs = Date.now();
    return sessionFile;
  }

  private mergeSessionEvents(eventStreams: SessionHistoryEvent[][]): SessionHistoryEvent[] {
    const merged: SessionHistoryEvent[] = [];
    const seen = new Set<string>();

    for (const stream of eventStreams) {
      for (const event of stream) {
        const key = this.getEventDedupKey(event);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(event);
      }
    }

    return merged;
  }

  private getEventDedupKey(event: SessionHistoryEvent): string {
    try {
      return JSON.stringify(event);
    } catch {
      if (event.type === "envelope-created") {
        return `envelope-created:${event.envelope.id}:${event.timestampMs}:${event.origin}`;
      }
      return [
        "envelope-status-changed",
        event.envelopeId,
        event.fromStatus,
        event.toStatus,
        event.timestampMs,
        event.origin,
        event.reason ?? "",
        event.outcome ?? "",
      ].join(":");
    }
  }

  private buildSessionFilePath(
    agentName: string,
    dateStr: string,
    chatDir: string,
    sessionId: string,
  ): string {
    return path.join(
      this.agentsDir,
      agentName,
      "internal_space",
      "history",
      dateStr,
      chatDir,
      `${sessionId}.json`,
    );
  }

  /**
   * Try to recover an existing unclosed session from disk.
   * Returns true if a session was found and tracked, false otherwise.
   * Called by the executor on session resume or before closing.
   */
  recoverSession(agentName: string, chatId?: string | null): boolean {
    const preferredChatDir = normalizeHistoryChatDir(chatId);
    const active = this.getActiveSession(agentName, preferredChatDir);
    if (active) return true;

    const historyDir = path.join(this.agentsDir, agentName, "internal_space", "history");

    try {
      if (fs.existsSync(historyDir)) {
        const dateDirs = fs
          .readdirSync(historyDir)
          .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
          .sort()
          .reverse();

        for (const dateDir of dateDirs) {
          const dateDirPath = path.join(historyDir, dateDir);
          const sessionCandidates =
            chatId === undefined || chatId === null
              ? this.listSessionCandidates(dateDirPath)
              : this.listSessionCandidates(dateDirPath, preferredChatDir);
          if (sessionCandidates.length === 0) continue;

          let latestSession: { id: string; startedAtMs: number; chatDir: string } | null = null;
          for (const candidate of sessionCandidates) {
            const session = readSessionFile(candidate.filePath);
            if (!session) continue;
            if (session.endedAtMs !== null) continue;
            if (!latestSession || session.startedAtMs > latestSession.startedAtMs) {
              latestSession = {
                id: candidate.id,
                startedAtMs: session.startedAtMs,
                chatDir: candidate.chatDir,
              };
            }
          }

          if (latestSession) {
            this.setActiveSession(agentName, latestSession.chatDir, {
              sessionId: latestSession.id,
              dateStr: dateDir,
              chatDir: latestSession.chatDir,
              startedAtMs: latestSession.startedAtMs,
              updatedAtMs: Date.now(),
              pendingEvents: [],
              journalEventsSinceCompact: 0,
              lastCompactedAtMs: Date.now(),
            });
            return true;
          }
        }
      }
    } catch (err) {
      logEvent("warn", "history-session-recover-failed", {
        "agent-name": agentName,
        error: errorMessage(err),
      });
    }

    return false;
  }

  /**
   * Recover all unclosed sessions for an agent across chat scopes.
   * Tracks the newest unclosed session per chat scope.
   */
  recoverAllSessions(agentName: string): number {
    const historyDir = path.join(this.agentsDir, agentName, "internal_space", "history");
    const latestByChat = new Map<string, { id: string; startedAtMs: number; dateStr: string; chatDir: string }>();

    try {
      if (fs.existsSync(historyDir)) {
        const dateDirs = fs
          .readdirSync(historyDir)
          .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
          .sort()
          .reverse();

        for (const dateDir of dateDirs) {
          const dateDirPath = path.join(historyDir, dateDir);
          const sessionCandidates = this.listSessionCandidates(dateDirPath);
          if (sessionCandidates.length === 0) continue;

          for (const candidate of sessionCandidates) {
            const session = readSessionFile(candidate.filePath);
            if (!session) continue;
            if (session.endedAtMs !== null) continue;
            const latest = latestByChat.get(candidate.chatDir);
            if (!latest || session.startedAtMs > latest.startedAtMs) {
              latestByChat.set(candidate.chatDir, {
                id: candidate.id,
                startedAtMs: session.startedAtMs,
                dateStr: dateDir,
                chatDir: candidate.chatDir,
              });
            }
          }
        }
      }
    } catch (err) {
      logEvent("warn", "history-session-recover-all-failed", {
        "agent-name": agentName,
        error: errorMessage(err),
      });
      return 0;
    }

    let recovered = 0;
    for (const latest of latestByChat.values()) {
      if (this.getActiveSession(agentName, latest.chatDir)) continue;
      this.setActiveSession(agentName, latest.chatDir, {
        sessionId: latest.id,
        dateStr: latest.dateStr,
        chatDir: latest.chatDir,
        startedAtMs: latest.startedAtMs,
        updatedAtMs: Date.now(),
        pendingEvents: [],
        journalEventsSinceCompact: 0,
        lastCompactedAtMs: Date.now(),
      });
      recovered += 1;
    }
    return recovered;
  }

  /**
   * Ensure the agent has an active history session (recover from disk or create new).
   * Called by the executor before processing envelopes.
   */
  ensureActiveSession(agentName: string, chatId?: string | null): void {
    if (!this.recoverSession(agentName, chatId)) {
      this.startSession(agentName, chatId ?? undefined);
    }
  }

  /**
   * Get agent names with currently active (unclosed) history sessions.
   */
  getActiveAgentNames(): string[] {
    return [...this.activeSessionsByAgent.keys()];
  }

  private listSessionCandidates(dateDirPath: string): Array<{
    id: string;
    filePath: string;
    chatDir: string;
  }>;
  private listSessionCandidates(dateDirPath: string, chatDirFilter: string): Array<{
    id: string;
    filePath: string;
    chatDir: string;
  }>;
  private listSessionCandidates(dateDirPath: string, chatDirFilter?: string): Array<{
    id: string;
    filePath: string;
    chatDir: string;
  }> {
    const candidates: Array<{ id: string; filePath: string; chatDir: string }> = [];

    const collectChatDir = (entry: string): void => {
      const fullPath = path.join(dateDirPath, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        return;
      }
      if (!stat.isDirectory()) return;
      for (const sessionId of listSessionFiles(fullPath)) {
        candidates.push({
          id: sessionId,
          filePath: path.join(fullPath, `${sessionId}.json`),
          chatDir: entry,
        });
      }
    };

    if (chatDirFilter) {
      collectChatDir(chatDirFilter);
      return candidates;
    }

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dateDirPath);
    } catch {
      return candidates;
    }

    for (const entry of entries) {
      collectChatDir(entry);
    }

    return candidates;
  }

  private getMostRecentActiveSession(agentName: string): ActiveHistorySession | undefined {
    const scoped = this.activeSessionsByAgent.get(agentName);
    if (!scoped || scoped.size === 0) return undefined;
    return [...scoped.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0];
  }

  private getActiveSession(agentName: string, chatDir: string): ActiveHistorySession | undefined {
    const scoped = this.activeSessionsByAgent.get(agentName);
    return scoped?.get(chatDir);
  }

  private setActiveSession(agentName: string, chatDir: string, session: ActiveHistorySession): void {
    const scoped = this.activeSessionsByAgent.get(agentName) ?? new Map<string, ActiveHistorySession>();
    scoped.set(chatDir, session);
    this.activeSessionsByAgent.set(agentName, scoped);
  }

  private getActiveSessionFilePathByChatDir(agentName: string, chatDir: string): string | null {
    const active = this.getActiveSession(agentName, chatDir);
    if (!active) return null;
    return this.buildSessionFilePath(agentName, active.dateStr, active.chatDir, active.sessionId);
  }

  private resolveParticipantAgentNames(envelope: Envelope): string[] {
    const participants = new Set<string>();

    try {
      const to = parseAddress(envelope.to);
      if (to.type === "agent" || to.type === "agent-new-chat" || to.type === "agent-chat") {
        participants.add(to.agentName);
      }
    } catch {
      // ignore invalid address
    }

    try {
      const from = parseAddress(envelope.from);
      if (from.type === "agent" || from.type === "agent-new-chat" || from.type === "agent-chat") {
        participants.add(from.agentName);
      }
    } catch {
      // ignore invalid address
    }

    return [...participants];
  }

  private getDateString(unixMs: number): string {
    const date = new Date(unixMs);
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: this.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const y = parts.find((p) => p.type === "year")?.value ?? "";
      const m = parts.find((p) => p.type === "month")?.value ?? "";
      const d = parts.find((p) => p.type === "day")?.value ?? "";
      return `${y}-${m}-${d}`;
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }
}
