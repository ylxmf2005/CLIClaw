/**
 * Session file I/O — atomic read/write for per-session JSON files.
 *
 * All writes use a temp file + rename pattern to prevent corruption.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { SessionFile, SessionHistoryEvent } from "./types.js";
import { SESSION_FILE_VERSION } from "./types.js";
import { logEvent, errorMessage } from "../../shared/daemon-log.js";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// ── Read ──

/**
 * Read and parse a session JSON file.
 * Returns null if the file doesn't exist or is corrupt.
 */
export function readSessionFile(filePath: string): SessionFile | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed.version !== SESSION_FILE_VERSION) {
      logEvent("warn", "session-file-version-mismatch", {
        path: filePath,
        expected: SESSION_FILE_VERSION,
        got: parsed.version,
      });
      return null;
    }

    if (typeof parsed.sessionId !== "string" || parsed.sessionId.trim().length === 0) return null;
    if (typeof parsed.agentName !== "string" || parsed.agentName.trim().length === 0) return null;
    if (!isFiniteNumber(parsed.startedAtMs)) return null;
    if (parsed.endedAtMs !== null && !isFiniteNumber(parsed.endedAtMs)) return null;
    if (!Array.isArray(parsed.events)) return null;

    return {
      version: SESSION_FILE_VERSION,
      sessionId: parsed.sessionId,
      agentName: parsed.agentName,
      startedAtMs: parsed.startedAtMs,
      endedAtMs: parsed.endedAtMs,
      events: parsed.events as SessionHistoryEvent[],
    };
  } catch (err) {
    logEvent("warn", "session-file-read-failed", {
      path: filePath,
      error: errorMessage(err),
    });
    return null;
  }
}

// ── Write (atomic) ──

/**
 * Write a session file atomically (write to .tmp, then rename).
 */
export function writeSessionFile(filePath: string, session: SessionFile): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(session, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

// ── Append history event ──

/**
 * Append a history event to an existing session file.
 * Creates the file if it doesn't exist (shouldn't happen in normal flow).
 */
export function appendEvent(filePath: string, entry: SessionHistoryEvent): void {
  const session = readSessionFile(filePath);
  if (!session) {
    logEvent("warn", "session-file-append-no-file", { path: filePath });
    return;
  }
  session.events.push(entry);
  writeSessionFile(filePath, session);
}

// ── Close session ──

/**
 * Set endedAtMs for a session file.
 * If a session is already closed, preserves the original endedAtMs.
 */
export function closeSessionFile(
  filePath: string,
  endedAtMs: number,
): void {
  const session = readSessionFile(filePath);
  if (!session) {
    logEvent("warn", "session-file-update-no-file", { path: filePath });
    return;
  }
  if (session.endedAtMs === null) {
    session.endedAtMs = endedAtMs;
  }
  writeSessionFile(filePath, session);
}

// ── Create new session file ──

/**
 * Create a new empty session JSON file.
 */
export function createSessionFile(params: {
  filePath: string;
  sessionId: string;
  agentName: string;
  startedAtMs: number;
}): void {
  const session: SessionFile = {
    version: SESSION_FILE_VERSION,
    sessionId: params.sessionId,
    agentName: params.agentName,
    startedAtMs: params.startedAtMs,
    endedAtMs: null,
    events: [],
  };
  writeSessionFile(params.filePath, session);
}

// ── List session files in a date directory ──

/**
 * List all session file names (without extension) in a date directory.
 * Returns empty array if the directory doesn't exist.
 */
export function listSessionFiles(dateDirPath: string): string[] {
  try {
    if (!fs.existsSync(dateDirPath)) return [];
    const stat = fs.statSync(dateDirPath);
    if (!stat.isDirectory()) return [];
    return fs
      .readdirSync(dateDirPath)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

// ── Journal (append-only) ──

const CURRENT_SESSION_JOURNAL_SUFFIX = ".events.jsonl";
const LEGACY_SESSION_JOURNAL_SUFFIX = ".events.ndjson";

function getSessionJournalBase(filePath: string): string {
  return filePath.endsWith(".json")
    ? filePath.slice(0, -5)
    : filePath;
}

/**
 * Per-session append-only journal path.
 * Example:
 *   <session>.json -> <session>.events.jsonl
 */
export function getSessionJournalPath(filePath: string): string {
  return `${getSessionJournalBase(filePath)}${CURRENT_SESSION_JOURNAL_SUFFIX}`;
}

function getLegacySessionJournalPath(filePath: string): string {
  return `${getSessionJournalBase(filePath)}${LEGACY_SESSION_JOURNAL_SUFFIX}`;
}

/**
 * Append one event line to the per-session journal.
 */
export function appendSessionJournalEvent(filePath: string, entry: SessionHistoryEvent): void {
  const journalPath = getSessionJournalPath(filePath);
  const dir = path.dirname(journalPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function readSessionJournalEventsFromPath(journalPath: string): SessionHistoryEvent[] {
  if (!fs.existsSync(journalPath)) return [];
  const stat = fs.statSync(journalPath);
  if (!stat.isFile()) return [];

  const raw = fs.readFileSync(journalPath, "utf8");
  if (!raw.trim()) return [];

  const events: SessionHistoryEvent[] = [];
  const lines = raw.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]?.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as SessionHistoryEvent);
    } catch (err) {
      logEvent("warn", "session-journal-line-parse-failed", {
        path: journalPath,
        "line-number": idx + 1,
        error: errorMessage(err),
      });
    }
  }
  return events;
}

/**
 * Read and parse all events from a per-session journal.
 * Corrupt lines are skipped with a warning.
 */
export function readSessionJournalEvents(filePath: string): SessionHistoryEvent[] {
  try {
    const journalPath = getSessionJournalPath(filePath);
    return readSessionJournalEventsFromPath(journalPath);
  } catch (err) {
    logEvent("warn", "session-journal-read-failed", {
      path: getSessionJournalPath(filePath),
      error: errorMessage(err),
    });
    return [];
  }
}

function readSessionJournalRawLines(journalPath: string): string[] {
  if (!fs.existsSync(journalPath)) return [];
  const stat = fs.statSync(journalPath);
  if (!stat.isFile()) return [];
  const raw = fs.readFileSync(journalPath, "utf8");
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function writeSessionJournalRawLines(journalPath: string, lines: string[]): void {
  const dir = path.dirname(journalPath);
  fs.mkdirSync(dir, { recursive: true });
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  const tmpPath = `${journalPath}.tmp`;
  fs.writeFileSync(tmpPath, body, "utf8");
  fs.renameSync(tmpPath, journalPath);
}

function migrateLegacySessionJournalFile(legacyPath: string): "renamed" | "merged" {
  const currentPath = legacyPath.endsWith(LEGACY_SESSION_JOURNAL_SUFFIX)
    ? `${legacyPath.slice(0, -LEGACY_SESSION_JOURNAL_SUFFIX.length)}${CURRENT_SESSION_JOURNAL_SUFFIX}`
    : legacyPath;

  if (!fs.existsSync(currentPath)) {
    fs.renameSync(legacyPath, currentPath);
    return "renamed";
  }

  const mergedLines: string[] = [];
  const seen = new Set<string>();
  for (const line of [
    ...readSessionJournalRawLines(legacyPath),
    ...readSessionJournalRawLines(currentPath),
  ]) {
    if (seen.has(line)) continue;
    seen.add(line);
    mergedLines.push(line);
  }

  writeSessionJournalRawLines(currentPath, mergedLines);
  fs.unlinkSync(legacyPath);
  return "merged";
}

export function migrateLegacySessionJournalsInAgentsDir(agentsDir: string): {
  renamedCount: number;
  mergedCount: number;
  failedCount: number;
} {
  const result = {
    renamedCount: 0,
    mergedCount: 0,
    failedCount: 0,
  };

  if (!fs.existsSync(agentsDir)) {
    return result;
  }

  const collectLegacyFiles = (historyDir: string, out: string[]): void => {
    const stack: string[] = [historyDir];
    while (stack.length > 0) {
      const dirPath = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith(LEGACY_SESSION_JOURNAL_SUFFIX)) {
          out.push(fullPath);
        }
      }
    }
  };

  let agentEntries: fs.Dirent[];
  try {
    agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return result;
  }

  const legacyPaths: string[] = [];
  for (const agentEntry of agentEntries) {
    if (!agentEntry.isDirectory()) continue;
    const historyDir = path.join(
      agentsDir,
      agentEntry.name,
      "internal_space",
      "history",
    );
    if (!fs.existsSync(historyDir)) continue;
    collectLegacyFiles(historyDir, legacyPaths);
  }

  for (const legacyPath of legacyPaths) {
    try {
      const migrated = migrateLegacySessionJournalFile(legacyPath);
      if (migrated === "renamed") {
        result.renamedCount += 1;
      } else {
        result.mergedCount += 1;
      }
    } catch (err) {
      result.failedCount += 1;
      logEvent("warn", "session-journal-legacy-migration-failed", {
        path: legacyPath,
        error: errorMessage(err),
      });
    }
  }

  return result;
}
