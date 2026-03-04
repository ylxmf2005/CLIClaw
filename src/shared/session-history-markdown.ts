import { formatUnixMsAsTimeZoneOffset } from "./time.js";

export type SessionSummaryStatus = "pending" | "ready" | "failed";

export interface SessionHistoryFrontmatter {
  sessionId: string;
  agentName: string;
  startedAt: string;
  endedAt: string;
  summary: string;
  summaryStatus: SessionSummaryStatus;
  summaryAttempts: number;
  summaryUpdatedAt: string;
  summaryError: string;
}

export interface SessionHistoryMarkdownDocument {
  frontmatter: SessionHistoryFrontmatter;
  body: string;
}

const FRONTMATTER_START = "---";

function formatHistoryTimestamp(unixMs: number, timeZone: string): string {
  if (!Number.isFinite(unixMs)) return "";
  return formatUnixMsAsTimeZoneOffset(unixMs, timeZone);
}

function parseStringField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === '""') return "";
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : String(parsed ?? "");
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function parseIntegerField(value: string): number {
  const n = Number(value.trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function splitFrontmatter(raw: string): { frontmatterRaw: string; bodyRaw: string } | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_START}\n`)) return null;

  const secondMarkerIdx = normalized.indexOf(`\n${FRONTMATTER_START}\n`, FRONTMATTER_START.length + 1);
  if (secondMarkerIdx < 0) return null;

  const frontmatterRaw = normalized.slice(FRONTMATTER_START.length + 1, secondMarkerIdx);
  const bodyRaw = normalized.slice(secondMarkerIdx + (`\n${FRONTMATTER_START}\n`).length);
  return { frontmatterRaw, bodyRaw };
}

export function buildInitialSessionHistoryFrontmatter(params: {
  sessionId: string;
  agentName: string;
  startedAtMs: number;
  timeZone: string;
}): SessionHistoryFrontmatter {
  return {
    sessionId: params.sessionId,
    agentName: params.agentName,
    startedAt: formatHistoryTimestamp(params.startedAtMs, params.timeZone),
    endedAt: "",
    summary: "",
    summaryStatus: "pending",
    summaryAttempts: 0,
    summaryUpdatedAt: "",
    summaryError: "",
  };
}

export function parseSessionHistoryMarkdown(raw: string): SessionHistoryMarkdownDocument | null {
  const split = splitFrontmatter(raw);
  if (!split) return null;

  const fields = new Map<string, string>();
  const lines = split.frontmatterRaw.split("\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    fields.set(key, value);
  }

  const statusRaw = parseStringField(fields.get("summary-status") ?? "");
  const summaryStatus: SessionSummaryStatus =
    statusRaw === "ready" || statusRaw === "failed" ? statusRaw : "pending";

  const doc: SessionHistoryMarkdownDocument = {
    frontmatter: {
      sessionId: parseStringField(fields.get("session-id") ?? ""),
      agentName: parseStringField(fields.get("agent-name") ?? ""),
      startedAt: parseStringField(fields.get("started-at") ?? ""),
      endedAt: parseStringField(fields.get("ended-at") ?? ""),
      summary: parseStringField(fields.get("summary") ?? ""),
      summaryStatus,
      summaryAttempts: parseIntegerField(fields.get("summary-attempts") ?? "0"),
      summaryUpdatedAt: parseStringField(fields.get("summary-updated-at") ?? ""),
      summaryError: parseStringField(fields.get("summary-error") ?? ""),
    },
    body: split.bodyRaw,
  };

  if (!doc.frontmatter.sessionId) return null;
  if (!doc.frontmatter.agentName) return null;
  return doc;
}

export function serializeSessionHistoryMarkdown(doc: SessionHistoryMarkdownDocument): string {
  const fm = doc.frontmatter;
  const lines = [
    `session-id: ${JSON.stringify(fm.sessionId)}`,
    `agent-name: ${JSON.stringify(fm.agentName)}`,
    `started-at: ${JSON.stringify(fm.startedAt)}`,
    `ended-at: ${JSON.stringify(fm.endedAt)}`,
    `summary: ${JSON.stringify(fm.summary)}`,
    `summary-status: ${JSON.stringify(fm.summaryStatus)}`,
    `summary-attempts: ${fm.summaryAttempts}`,
    `summary-updated-at: ${JSON.stringify(fm.summaryUpdatedAt)}`,
    `summary-error: ${JSON.stringify(fm.summaryError)}`,
  ];

  const body = doc.body.replace(/\r\n/g, "\n").trimEnd();
  return `${FRONTMATTER_START}\n${lines.join("\n")}\n${FRONTMATTER_START}\n\n${body}\n`;
}
