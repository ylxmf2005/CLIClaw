import type { Envelope } from "../../envelope/types.js";
import type { SessionFile } from "./types.js";
import { parseAddress } from "../../adapters/types.js";

export const DEFAULT_HISTORY_CHAT_DIR = "_no_chat";

export function normalizeHistoryChatDir(chatId?: string | null): string {
  if (typeof chatId !== "string") return DEFAULT_HISTORY_CHAT_DIR;
  const trimmed = chatId.trim();
  if (!trimmed) return DEFAULT_HISTORY_CHAT_DIR;
  const encoded = encodeURIComponent(trimmed);
  if (!encoded || encoded === "." || encoded === "..") {
    return DEFAULT_HISTORY_CHAT_DIR;
  }
  return encoded;
}

export function resolveEnvelopeChatId(envelope: Envelope): string | null {
  const fromAddress = parseAddressOrNull(envelope.from);
  if (fromAddress?.type === "channel") return fromAddress.chatId;

  const toAddress = parseAddressOrNull(envelope.to);
  if (toAddress?.type === "channel") return toAddress.chatId;

  const metadata = envelope.metadata as Record<string, unknown> | undefined;
  if (metadata && typeof metadata.chatScope === "string" && metadata.chatScope.trim().length > 0) {
    return metadata.chatScope.trim();
  }

  if (metadata && typeof metadata.cronScheduleId === "string" && metadata.cronScheduleId.trim().length > 0) {
    return `cron:${metadata.cronScheduleId.trim()}`;
  }

  const fromAgentName = extractAgentName(fromAddress);
  const toAgentName = extractAgentName(toAddress);
  if (fromAgentName && toAgentName) {
    return `internal:${fromAgentName}:to:${toAgentName}`;
  }

  return null;
}

export function inferSessionChatId(session: SessionFile): string | null {
  for (const event of session.events) {
    if (event.type !== "envelope-created") continue;
    const chatId = resolveEnvelopeChatId(event.envelope);
    if (chatId) return chatId;
  }
  return null;
}

function parseAddressOrNull(address: string): ReturnType<typeof parseAddress> | null {
  try {
    return parseAddress(address);
  } catch {
    // Ignore malformed addresses in historical payloads.
    return null;
  }
}

function extractAgentName(address: ReturnType<typeof parseAddress> | null): string | null {
  if (!address) return null;
  if (address.type === "agent" || address.type === "agent-new-chat" || address.type === "agent-chat") {
    return address.agentName;
  }
  return null;
}
