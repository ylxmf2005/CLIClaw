import * as fs from "node:fs";
import * as path from "node:path";

import type { SessionFile, SessionHistoryEvent } from "./types.js";
import { readSessionFile } from "./session-file-io.js";
import {
  buildInitialSessionHistoryFrontmatter,
  parseSessionHistoryMarkdown,
  serializeSessionHistoryMarkdown,
  type SessionHistoryMarkdownDocument,
} from "../../shared/session-history-markdown.js";
import { errorMessage, logEvent } from "../../shared/daemon-log.js";
import { formatUnixMsAsTimeZoneOffset } from "../../shared/time.js";

export interface SessionConversationEntry {
  timestampMs: number;
  from: string;
  to: string;
  content: string;
}

function formatHistoryTimestamp(unixMs: number, timeZone: string): string {
  if (!Number.isFinite(unixMs)) return "";
  return formatUnixMsAsTimeZoneOffset(unixMs, timeZone);
}

function readRaw(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    logEvent("warn", "session-markdown-read-failed", {
      path: filePath,
      error: errorMessage(err),
    });
    return null;
  }
}

export function getSessionMarkdownPath(filePath: string): string {
  return filePath.endsWith(".json")
    ? `${filePath.slice(0, -5)}.md`
    : `${filePath}.md`;
}

export function readSessionMarkdownFile(filePath: string): SessionHistoryMarkdownDocument | null {
  const raw = readRaw(filePath);
  if (raw === null) return null;
  const parsed = parseSessionHistoryMarkdown(raw);
  if (!parsed) {
    logEvent("warn", "session-markdown-parse-failed", {
      path: filePath,
    });
  }
  return parsed;
}

export function writeSessionMarkdownFile(filePath: string, doc: SessionHistoryMarkdownDocument): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, serializeSessionHistoryMarkdown(doc), "utf8");
  fs.renameSync(tmpPath, filePath);
}

export function createSessionMarkdownFile(params: {
  filePath: string;
  sessionId: string;
  agentName: string;
  startedAtMs: number;
  timeZone: string;
}): void {
  const doc: SessionHistoryMarkdownDocument = {
    frontmatter: buildInitialSessionHistoryFrontmatter({
      sessionId: params.sessionId,
      agentName: params.agentName,
      startedAtMs: params.startedAtMs,
      timeZone: params.timeZone,
    }),
    body: "",
  };
  writeSessionMarkdownFile(params.filePath, doc);
}

export function ensureSessionMarkdownFile(params: {
  filePath: string;
  sessionId: string;
  agentName: string;
  startedAtMs: number;
  timeZone: string;
}): void {
  if (fs.existsSync(params.filePath)) return;
  createSessionMarkdownFile(params);
}

function formatConversationEntry(entry: SessionConversationEntry, timeZone: string): string {
  const content = entry.content.trim() ? entry.content.trim() : "(none)";
  return [
    `## ${formatHistoryTimestamp(entry.timestampMs, timeZone)}`,
    `from: ${entry.from}`,
    `to: ${entry.to}`,
    "content:",
    content,
    "",
  ].join("\n");
}

export function appendSessionMarkdownConversation(
  filePath: string,
  entry: SessionConversationEntry,
  timeZone: string
): void {
  const doc = readSessionMarkdownFile(filePath);
  if (!doc) {
    logEvent("warn", "session-markdown-append-no-file", {
      path: filePath,
    });
    return;
  }

  const nextBody = `${doc.body.trimEnd()}\n\n${formatConversationEntry(entry, timeZone)}`.trimStart();
  doc.body = nextBody;
  writeSessionMarkdownFile(filePath, doc);
}

export function ensureSessionMarkdownForJson(params: {
  sessionJsonPath: string;
  session: SessionFile;
  timeZone: string;
}): string {
  const markdownPath = getSessionMarkdownPath(params.sessionJsonPath);
  if (fs.existsSync(markdownPath)) return markdownPath;

  const body = buildSessionMarkdownBodyFromEvents(params.session.events, params.timeZone);
  const doc: SessionHistoryMarkdownDocument = {
    frontmatter: buildInitialSessionHistoryFrontmatter({
      sessionId: params.session.sessionId,
      agentName: params.session.agentName,
      startedAtMs: params.session.startedAtMs,
      timeZone: params.timeZone,
    }),
    body,
  };
  if (params.session.endedAtMs !== null) {
    doc.frontmatter.endedAt = formatHistoryTimestamp(params.session.endedAtMs, params.timeZone);
    doc.frontmatter.summaryStatus = "pending";
  }
  writeSessionMarkdownFile(markdownPath, doc);
  return markdownPath;
}

export function markSessionMarkdownClosed(filePath: string, endedAtMs: number, timeZone: string): void {
  const doc = readSessionMarkdownFile(filePath);
  if (!doc) return;
  if (!doc.frontmatter.endedAt) {
    doc.frontmatter.endedAt = formatHistoryTimestamp(endedAtMs, timeZone);
  }
  if (doc.frontmatter.summaryStatus !== "ready") {
    doc.frontmatter.summaryStatus = "pending";
  }
  doc.frontmatter.summaryUpdatedAt = formatHistoryTimestamp(Date.now(), timeZone);
  writeSessionMarkdownFile(filePath, doc);
}

export function markSessionMarkdownClosedBySessionJsonPath(params: {
  sessionJsonPath: string;
  endedAtMs: number;
  timeZone: string;
}): void {
  const markdownPath = getSessionMarkdownPath(params.sessionJsonPath);
  if (!fs.existsSync(markdownPath)) {
    const session = readSessionFile(params.sessionJsonPath);
    if (session) {
      ensureSessionMarkdownForJson({
        sessionJsonPath: params.sessionJsonPath,
        session,
        timeZone: params.timeZone,
      });
    }
  }
  markSessionMarkdownClosed(markdownPath, params.endedAtMs, params.timeZone);
}

export function markSessionMarkdownSummaryAttempt(
  filePath: string,
  timeZone: string
): SessionHistoryMarkdownDocument | null {
  const doc = readSessionMarkdownFile(filePath);
  if (!doc) return null;
  doc.frontmatter.summaryAttempts += 1;
  doc.frontmatter.summaryStatus = "pending";
  doc.frontmatter.summaryError = "";
  doc.frontmatter.summaryUpdatedAt = formatHistoryTimestamp(Date.now(), timeZone);
  writeSessionMarkdownFile(filePath, doc);
  return doc;
}

export function markSessionMarkdownSummaryReady(params: {
  filePath: string;
  summary: string;
  timeZone: string;
}): void {
  const doc = readSessionMarkdownFile(params.filePath);
  if (!doc) return;

  doc.frontmatter.summary = params.summary.trim();
  doc.frontmatter.summaryStatus = "ready";
  doc.frontmatter.summaryError = "";
  doc.frontmatter.summaryUpdatedAt = formatHistoryTimestamp(Date.now(), params.timeZone);
  writeSessionMarkdownFile(params.filePath, doc);
}

export function markSessionMarkdownSummaryFailure(params: {
  filePath: string;
  error: string;
  terminal: boolean;
  timeZone: string;
}): void {
  const doc = readSessionMarkdownFile(params.filePath);
  if (!doc) return;

  doc.frontmatter.summaryStatus = params.terminal ? "failed" : "pending";
  doc.frontmatter.summaryError = params.error.trim();
  if (params.terminal && !doc.frontmatter.summary.trim()) {
    doc.frontmatter.summary = "summary-unavailable";
  }
  doc.frontmatter.summaryUpdatedAt = formatHistoryTimestamp(Date.now(), params.timeZone);
  writeSessionMarkdownFile(params.filePath, doc);
}

export function buildSessionMarkdownBodyFromEvents(
  events: SessionHistoryEvent[],
  timeZone: string
): string {
  const blocks: string[] = [];
  for (const event of events) {
    if (event.type !== "envelope-created") continue;
    blocks.push(
      formatConversationEntry({
        timestampMs: event.timestampMs,
        from: event.envelope.from,
        to: event.envelope.to,
        content: extractEnvelopeContentText(event.envelope),
      }, timeZone).trimEnd(),
    );
  }
  return blocks.join("\n\n");
}

export function extractEnvelopeContentText(envelope: {
  content: {
    text?: string;
    attachments?: Array<{ source: string; filename?: string }>;
  };
}): string {
  const text = (envelope.content.text ?? "").trim();
  if (text) return text;
  const attachments = envelope.content.attachments ?? [];
  if (attachments.length < 1) return "(none)";
  return attachments
    .map((att) => {
      const name = (att.filename ?? "").trim();
      return name ? `[attachment] ${name} (${att.source})` : `[attachment] ${att.source}`;
    })
    .join("\n");
}
