/**
 * Team mention resolution for the web frontend.
 *
 * Mentions are structured metadata (not text prefixes). The frontend
 * collects a `mentions: string[]` via the mention bar UI and passes
 * them alongside the message text.
 */

export type MentionResolution =
  | { kind: "broadcast"; recipients: string[]; text: string }
  | { kind: "targeted"; recipients: string[]; text: string }
  | { kind: "invalid"; recipients: []; text: string; invalidNames: string[] };

const ALL_SENTINEL = "@all";

/**
 * Resolve a structured mentions array against the team member list.
 *
 * @param mentions - Array of mention strings from the UI (agent names or "@all")
 * @param text - Raw message text (no @-prefixes — mentions are metadata)
 * @param memberAgentNames - All agent names in the team
 * @returns Resolution with recipients and cleaned text
 */
export function resolveTeamMentions(
  mentions: string[],
  text: string,
  memberAgentNames: string[],
): MentionResolution {
  const trimmed = text.trim();
  const members = unique(memberAgentNames);

  if (mentions.length === 0) {
    return { kind: "invalid", recipients: [], text: trimmed, invalidNames: [] };
  }

  // @all → broadcast to all members
  if (mentions.some((m) => m.toLowerCase() === ALL_SENTINEL.toLowerCase() || m.toLowerCase() === "all")) {
    return { kind: "broadcast", recipients: members, text: trimmed };
  }

  // Validate each mentioned name against the member list
  const resolved: string[] = [];
  const invalid: string[] = [];

  for (const mention of mentions) {
    const name = mention.trim();
    if (!name) continue;
    const match = members.find((m) => m.toLowerCase() === name.toLowerCase());
    if (match) {
      if (!resolved.includes(match)) {
        resolved.push(match);
      }
    } else {
      invalid.push(name);
    }
  }

  if (invalid.length > 0) {
    return { kind: "invalid", recipients: [], text: trimmed, invalidNames: invalid };
  }

  return { kind: "targeted", recipients: resolved, text: trimmed };
}

/**
 * Check whether a mention string is the @all sentinel.
 */
export function isAllMention(mention: string): boolean {
  return mention.toLowerCase() === ALL_SENTINEL.toLowerCase() || mention.toLowerCase() === "all";
}

/**
 * Build the mentions array to send to the API from the UI state.
 * Normalizes @all to the sentinel value.
 */
export function buildMentionsPayload(mentions: string[]): string[] {
  if (mentions.some(isAllMention)) {
    return [ALL_SENTINEL];
  }
  return [...mentions];
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
