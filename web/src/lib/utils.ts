import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ChatConversation, Envelope } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateChatId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Global boss timezone. Set by AppStateProvider after fetching daemon time.
 * Falls back to browser timezone if not configured.
 */
let bossTimezone: string | undefined;

export function setBossTimezone(tz: string | undefined) {
  bossTimezone = tz;
}

function getTimeZoneOptions(): { timeZone?: string } {
  return bossTimezone ? { timeZone: bossTimezone } : {};
}

function decodeIfEncoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type ParsedAddress =
  | { type: "agent"; raw: string; name: string }
  | { type: "team"; raw: string; name: string }
  | { type: "channel"; raw: string; name: string; adapterType: string; chatId: string }
  | { type: "unknown"; raw: string; name: string };

export function parseAddress(address: string): ParsedAddress {
  const raw = address.trim();

  if (raw.startsWith("agent:")) {
    const rest = raw.slice(6);
    const name = rest.split(":")[0] || rest;
    return { type: "agent", raw, name };
  }

  if (raw.startsWith("team:")) {
    const rest = raw.slice(5);
    const name = rest.split(":")[0] || rest;
    return { type: "team", raw, name };
  }

  if (raw.startsWith("channel:")) {
    const parts = raw.split(":");
    const adapterType = parts[1] ?? "";
    const chatId = parts.slice(2).join(":");
    const name = chatId ? `${adapterType}:${chatId}` : adapterType;
    return { type: "channel", raw, name, adapterType, chatId };
  }

  return { type: "unknown", raw, name: raw };
}

function readChannelUser(metadata: Record<string, unknown> | undefined): {
  id?: string;
  username?: string;
  displayName?: string;
} | undefined {
  const raw = metadata?.channelUser;
  if (!raw || typeof raw !== "object") return undefined;

  const obj = raw as Record<string, unknown>;
  const id = trimOrUndefined(obj.id);
  const username = trimOrUndefined(obj.username)?.replace(/^@/, "");
  const displayName = trimOrUndefined(obj.displayName);
  if (!id && !username && !displayName) return undefined;

  return { id, username, displayName };
}

function readChannelName(metadata: Record<string, unknown> | undefined): string | undefined {
  const raw = metadata?.chat;
  if (!raw || typeof raw !== "object") return undefined;
  return trimOrUndefined((raw as Record<string, unknown>).name);
}

export function formatChannelMentionTarget(adapterType: string, chatId: string): string {
  if (adapterType === "console") return "web";
  if (adapterType === "telegram") return "telegram";

  const adapter = adapterType.trim();
  if (adapter) return adapter.toLowerCase();

  const label = formatChatLabel(chatId).trim();
  return label ? label.toLowerCase() : "channel";
}

export function getEnvelopeSenderName(envelope: Envelope): string {
  const from = parseAddress(envelope.from);
  if (from.type !== "channel") return from.name;

  if (from.adapterType === "console") {
    return envelope.fromBoss ? "You" : "Web";
  }

  const metadata =
    envelope.metadata && typeof envelope.metadata === "object"
      ? (envelope.metadata as Record<string, unknown>)
      : undefined;
  const channelUser = readChannelUser(metadata);
  if (channelUser?.displayName) {
    return channelUser.username
      ? `${channelUser.displayName} (@${channelUser.username})`
      : channelUser.displayName;
  }

  if (from.adapterType === "telegram") {
    const chatName = readChannelName(metadata);
    if (chatName) return chatName;
    return "Telegram";
  }

  return from.adapterType || "Channel";
}

export function getEnvelopeSenderKey(envelope: Envelope): string {
  const from = parseAddress(envelope.from);
  if (from.type !== "channel") return `${from.type}:${from.name}`;

  const metadata =
    envelope.metadata && typeof envelope.metadata === "object"
      ? (envelope.metadata as Record<string, unknown>)
      : undefined;
  const channelUser = readChannelUser(metadata);
  if (channelUser?.id) {
    return `channel:${from.adapterType}:${from.chatId}:user:${channelUser.id}`;
  }
  if (channelUser?.username) {
    return `channel:${from.adapterType}:${from.chatId}:user:@${channelUser.username.toLowerCase()}`;
  }
  return `channel:${from.adapterType}:${from.chatId}`;
}

/**
 * Formats a timestamp for display in chat lists.
 * Same day: "HH:MM", within 7 days: weekday name, older: "Mon D".
 * Uses boss timezone if configured, otherwise browser timezone.
 */
export function formatTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const tzOpts = getTimeZoneOptions();
  if (diff < 86400000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...tzOpts });
  }
  if (diff < 86400000 * 7) {
    return d.toLocaleDateString([], { weekday: "short", ...tzOpts });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...tzOpts });
}

/**
 * Formats a timestamp for inline message display (always "HH:MM").
 * Uses boss timezone if configured.
 */
export function formatMessageTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const tzOpts = getTimeZoneOptions();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...tzOpts });
}

/**
 * Formats a raw chatId into a human-readable label.
 * - Decodes URL-encoded characters (e.g. %3A → :)
 * - Strips common prefixes (team:, console-chat-)
 * - Truncates long UUIDs to short form
 */
export function formatChatLabel(chatId: string): string {
  let label = decodeIfEncoded(chatId);

  if (label === "default") return "Default";

  // Strip "team:" prefix
  if (label.startsWith("team:")) {
    label = label.slice(5);
  }

  if (!label) return "Chat";

  // "console-chat-<uuid>" should be treated as an internal transport id.
  if (/^console-chat-[0-9a-f-]+$/i.test(label)) {
    return "Web chat";
  }

  // Internal generated agent chat IDs are not user-facing.
  if (/^agent-chat-[a-z0-9-]+$/i.test(label)) {
    return "Chat";
  }

  // Bare UUIDs are transport IDs; avoid exposing raw fragments in UI.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(label)) {
    return "Chat";
  }

  // Truncate if still too long
  if (label.length > 28) {
    return label.slice(0, 25) + "…";
  }

  return label;
}

export function resolveDefaultChatId(
  conversations: ChatConversation[],
  agentName: string
): string | undefined {
  const agentConvos = conversations
    .filter((c) => c.agentName === agentName)
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt))
  return agentConvos[0]?.chatId
}
