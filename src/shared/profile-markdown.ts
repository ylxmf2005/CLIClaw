const FRONTMATTER_MARKER = "---";

export interface ProfileMarkdownDocument {
  frontmatter: Record<string, string>;
  body: string;
}

function parseFrontmatterValue(raw: string): string {
  const trimmed = raw.trim();
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

function splitFrontmatter(raw: string): { frontmatterRaw: string; bodyRaw: string } | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_MARKER}\n`)) return null;

  const secondMarkerIdx = normalized.indexOf(`\n${FRONTMATTER_MARKER}\n`, FRONTMATTER_MARKER.length + 1);
  if (secondMarkerIdx < 0) return null;

  return {
    frontmatterRaw: normalized.slice(FRONTMATTER_MARKER.length + 1, secondMarkerIdx),
    bodyRaw: normalized.slice(secondMarkerIdx + (`\n${FRONTMATTER_MARKER}\n`).length),
  };
}

export function parseProfileMarkdown(raw: string): ProfileMarkdownDocument | null {
  const split = splitFrontmatter(raw);
  if (!split) return null;

  const frontmatter: Record<string, string> = {};
  for (const line of split.frontmatterRaw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    const value = line.slice(idx + 1);
    frontmatter[key] = parseFrontmatterValue(value);
  }

  return {
    frontmatter,
    body: split.bodyRaw,
  };
}

export function serializeProfileMarkdown(doc: ProfileMarkdownDocument): string {
  const lines = Object.entries(doc.frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value ?? "")}`);
  const body = doc.body.replace(/\r\n/g, "\n").trimEnd();
  return `${FRONTMATTER_MARKER}\n${lines.join("\n")}\n${FRONTMATTER_MARKER}\n\n${body}\n`;
}

