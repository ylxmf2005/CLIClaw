import * as fs from "node:fs";
import * as path from "node:path";

import {
  DEFAULT_MEMORY_LONGTERM_MAX_CHARS,
  DEFAULT_MEMORY_SHORTTERM_DAYS,
  DEFAULT_MEMORY_SHORTTERM_PER_DAY_MAX_CHARS,
  DEFAULT_SESSION_SUMMARY_PER_SESSION_MAX_CHARS,
  DEFAULT_SESSION_SUMMARY_RECENT_DAYS,
} from "./defaults.js";
import { parseSessionHistoryMarkdown } from "./session-history-markdown.js";
import { assertValidAgentName } from "./validation.js";

const MEMORY_FILENAME = "MEMORY.md";
const DAILY_MEMORIES_DIRNAME = "memories";
const DAILY_MEMORY_FILENAME_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;
const HISTORY_DATE_DIRNAME_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getAgentInternalSpaceDir(cliclawDir: string, agentName: string): string {
  return path.join(cliclawDir, "agents", agentName, "internal_space");
}

function getAgentMemoryPath(cliclawDir: string, agentName: string): string {
  return path.join(getAgentInternalSpaceDir(cliclawDir, agentName), MEMORY_FILENAME);
}

function getAgentDailyMemoriesDir(cliclawDir: string, agentName: string): string {
  return path.join(getAgentInternalSpaceDir(cliclawDir, agentName), DAILY_MEMORIES_DIRNAME);
}

function getAgentHistoryDir(cliclawDir: string, agentName: string): string {
  return path.join(getAgentInternalSpaceDir(cliclawDir, agentName), "history");
}

function truncateWithMarker(input: string, maxChars: number, marker: string): string {
  if (input.length <= maxChars) return input;
  const trimmed = input.slice(0, maxChars);
  return `${trimmed}\n\n${marker}`;
}

export function ensureAgentInternalSpaceLayout(params: {
  cliclawDir: string;
  agentName: string;
}): { ok: true } | { ok: false; error: string } {
  try {
    assertValidAgentName(params.agentName);

    const dir = getAgentInternalSpaceDir(params.cliclawDir, params.agentName);
    const memoryPath = getAgentMemoryPath(params.cliclawDir, params.agentName);

    fs.mkdirSync(dir, { recursive: true });

    const dailyDir = getAgentDailyMemoriesDir(params.cliclawDir, params.agentName);
    fs.mkdirSync(dailyDir, { recursive: true });
    if (fs.existsSync(dailyDir) && !fs.statSync(dailyDir).isDirectory()) {
      return { ok: false, error: `Expected directory at ${dailyDir}` };
    }

    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, "", "utf8");
    } else {
      const stat = fs.statSync(memoryPath);
      if (!stat.isFile()) {
        return { ok: false, error: `Expected file at ${memoryPath}` };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function readAgentInternalMemorySnapshot(params: {
  cliclawDir: string;
  agentName: string;
}):
  | { ok: true; note: string }
  | { ok: false; error: string } {
  try {
    assertValidAgentName(params.agentName);

    const memoryPath = getAgentMemoryPath(params.cliclawDir, params.agentName);

    let raw = "";
    if (fs.existsSync(memoryPath)) {
      const stat = fs.statSync(memoryPath);
      if (stat.isFile()) {
        raw = fs.readFileSync(memoryPath, "utf8");
      }
    }

    const note = truncateWithMarker(
      raw.trim(),
      DEFAULT_MEMORY_LONGTERM_MAX_CHARS,
      `<<truncated due to internal-space-memory-max-chars=${DEFAULT_MEMORY_LONGTERM_MAX_CHARS}>>`
    );

    return { ok: true, note };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function readAgentInternalDailyMemorySnapshot(params: {
  cliclawDir: string;
  agentName: string;
}):
  | { ok: true; note: string }
  | { ok: false; error: string } {
  try {
    assertValidAgentName(params.agentName);

    const dailyMaxChars = DEFAULT_MEMORY_SHORTTERM_PER_DAY_MAX_CHARS * DEFAULT_MEMORY_SHORTTERM_DAYS;

    const dailyDir = getAgentDailyMemoriesDir(params.cliclawDir, params.agentName);
    if (!fs.existsSync(dailyDir)) {
      return { ok: true, note: "" };
    }
    const stat = fs.statSync(dailyDir);
    if (!stat.isDirectory()) {
      return { ok: false, error: `Expected directory at ${dailyDir}` };
    }

    const candidateFiles = fs
      .readdirSync(dailyDir)
      .filter((name) => DAILY_MEMORY_FILENAME_REGEX.test(name))
      .sort()
      .reverse()
      .slice(0, DEFAULT_MEMORY_SHORTTERM_DAYS);

    const blocks: string[] = [];
    for (const filename of candidateFiles) {
      const filePath = path.join(dailyDir, filename);
      try {
        const fileStat = fs.statSync(filePath);
        if (!fileStat.isFile()) continue;
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw) continue;
        const truncated = truncateWithMarker(
          raw,
          DEFAULT_MEMORY_SHORTTERM_PER_DAY_MAX_CHARS,
          `<<truncated due to internal-space-daily-per-day-max-chars=${DEFAULT_MEMORY_SHORTTERM_PER_DAY_MAX_CHARS}>>`
        );
        blocks.push(`--- ${filename.replace(/\.md$/, "")} ---\n${truncated}`);
      } catch {
        // Best-effort: skip unreadable daily files.
      }
    }

    const combinedRaw = blocks.join("\n\n");
    const combined = truncateWithMarker(
      combinedRaw,
      dailyMaxChars,
      `<<truncated due to internal-space-daily-max-chars=${dailyMaxChars}>>`
    );

    return { ok: true, note: combined };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function readAgentInternalSessionSummarySnapshot(params: {
  cliclawDir: string;
  agentName: string;
  recentDays?: number;
  perSessionMaxChars?: number;
}):
  | { ok: true; note: string }
  | { ok: false; error: string } {
  try {
    assertValidAgentName(params.agentName);

    const recentDays = params.recentDays ?? DEFAULT_SESSION_SUMMARY_RECENT_DAYS;
    const perSessionMaxChars = params.perSessionMaxChars ?? DEFAULT_SESSION_SUMMARY_PER_SESSION_MAX_CHARS;

    const historyDir = getAgentHistoryDir(params.cliclawDir, params.agentName);
    if (!fs.existsSync(historyDir)) {
      return { ok: true, note: "" };
    }
    const stat = fs.statSync(historyDir);
    if (!stat.isDirectory()) {
      return { ok: false, error: `Expected directory at ${historyDir}` };
    }

    const dateDirs = fs
      .readdirSync(historyDir)
      .filter((name) => HISTORY_DATE_DIRNAME_REGEX.test(name))
      .sort()
      .reverse()
      .slice(0, Math.max(1, recentDays));

    const blocks: Array<{ sortKey: string; block: string }> = [];
    for (const dateDir of dateDirs) {
      const datePath = path.join(historyDir, dateDir);
      let chatDirs: string[] = [];
      try {
        chatDirs = fs.readdirSync(datePath);
      } catch {
        continue;
      }

      for (const chatDir of chatDirs) {
        const chatPath = path.join(datePath, chatDir);
        let chatStat: fs.Stats;
        try {
          chatStat = fs.statSync(chatPath);
        } catch {
          continue;
        }
        if (!chatStat.isDirectory()) continue;

        let entries: string[] = [];
        try {
          entries = fs.readdirSync(chatPath);
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (!entry.endsWith(".md")) continue;
          const mdPath = path.join(chatPath, entry);
          try {
            const mdStat = fs.statSync(mdPath);
            if (!mdStat.isFile()) continue;
            const raw = fs.readFileSync(mdPath, "utf8");
            const parsed = parseSessionHistoryMarkdown(raw);
            if (!parsed) continue;
            if (!parsed.frontmatter.endedAt.trim()) continue;

            const sessionId = parsed.frontmatter.sessionId || entry.replace(/\.md$/, "");
            const summary = parsed.frontmatter.summary.trim() || "summary-unavailable";
            const sortKey = parsed.frontmatter.endedAt || parsed.frontmatter.startedAt || dateDir;
            const payload = [
              `session-id: ${sessionId}`,
              `session-history-md: ${mdPath}`,
              "summary:",
              summary,
            ].join("\n");
            const truncated = truncateWithMarker(
              payload,
              Math.max(1_000, perSessionMaxChars),
              `<<truncated due to internal-space-session-summary-per-session-max-chars=${Math.max(1_000, perSessionMaxChars)}>>`,
            );
            blocks.push({
              sortKey,
              block: `--- ${sessionId} ---\n${truncated}`,
            });
          } catch {
            // Best-effort: skip unreadable files.
          }
        }
      }
    }

    blocks.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const note = blocks.map((item) => item.block).join("\n\n");
    return { ok: true, note };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}
