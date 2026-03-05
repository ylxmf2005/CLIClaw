import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ChatConversation } from "./types"

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

export function resolveDefaultChatId(
  conversations: ChatConversation[],
  agentName: string
): string | undefined {
  const agentConvos = conversations
    .filter((c) => c.agentName === agentName)
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt))
  return agentConvos[0]?.chatId
}
