export type TeamRecipientResolution =
  | {
      kind: "broadcast";
      recipients: string[];
      text: string;
    }
  | {
      kind: "single";
      recipients: [string];
      text: string;
      mentioned: string;
    }
  | {
      kind: "unknown";
      recipients: [];
      text: string;
      mentioned: string;
    };

const LEADING_MENTION_RE = /^@([A-Za-z0-9._-]+)(?:\s+|$)/;

export function resolveTeamRecipients(
  rawText: string,
  memberAgentNames: string[],
): TeamRecipientResolution {
  const text = rawText.trim();
  const members = unique(memberAgentNames);
  if (members.length === 0) {
    return {
      kind: "broadcast",
      recipients: [],
      text,
    };
  }

  const mentionMatch = text.match(LEADING_MENTION_RE);
  if (!mentionMatch) {
    return {
      kind: "broadcast",
      recipients: members,
      text,
    };
  }

  const mentioned = (mentionMatch[1] ?? "").trim();
  const lowered = mentioned.toLowerCase();
  const withoutMention = text.replace(LEADING_MENTION_RE, "").trim();
  const resolvedText = withoutMention.length > 0 ? withoutMention : text;

  if (lowered === "all") {
    return {
      kind: "broadcast",
      recipients: members,
      text: resolvedText,
    };
  }

  const target = members.find((name) => name.toLowerCase() === lowered);
  if (!target) {
    return {
      kind: "unknown",
      recipients: [],
      text,
      mentioned,
    };
  }

  return {
    kind: "single",
    recipients: [target],
    text: resolvedText,
    mentioned: target,
  };
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
