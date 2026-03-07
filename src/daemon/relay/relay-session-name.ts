/**
 * Helpers for encoding/decoding relay worker names.
 *
 * Relay workers are addressed by a single string name, but the web UI tracks
 * PTY streams by `{ agentName, chatId }`.
 */

const RELAY_NAME_PREFIX = "cliclaw";
const CHAT_DELIMITER = "__chat__";

export function buildRelaySessionName(agentName: string, chatId: string): string {
  return `${RELAY_NAME_PREFIX}-${agentName}${CHAT_DELIMITER}${chatId}`;
}

export function parseRelaySessionName(
  relayName: string
): { agentName: string; chatId: string } | null {
  if (!relayName.startsWith(`${RELAY_NAME_PREFIX}-`)) return null;
  const body = relayName.slice(RELAY_NAME_PREFIX.length + 1);
  const idx = body.indexOf(CHAT_DELIMITER);
  if (idx <= 0 || idx === body.length - CHAT_DELIMITER.length) return null;
  return {
    agentName: body.slice(0, idx),
    chatId: body.slice(idx + CHAT_DELIMITER.length),
  };
}
