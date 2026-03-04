// Shared color utilities for avatar gradients and sender name colors.
// Deterministic hashing ensures the same name always gets the same color.

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// ─── Avatar gradient colors ────────────────────────────────

export const AVATAR_GRADIENT_COLORS = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
  "from-lime-500 to-green-600",
  "from-fuchsia-500 to-purple-600",
];

/** Returns a deterministic Tailwind gradient class pair for the given name. */
export function getAvatarColors(name: string): { from: string; to: string } {
  const pair = AVATAR_GRADIENT_COLORS[nameHash(name) % AVATAR_GRADIENT_COLORS.length];
  const [from, to] = pair.split(" ");
  return { from, to };
}

/** Returns the full gradient class string (e.g. "from-cyan-500 to-blue-600"). */
export function getAvatarColor(name: string): string {
  return AVATAR_GRADIENT_COLORS[nameHash(name) % AVATAR_GRADIENT_COLORS.length];
}

// ─── Sender name colors (for message lists) ────────────────

export const SENDER_COLORS = [
  "text-cyan-400 dark:text-cyan-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-rose-600 dark:text-rose-400",
  "text-indigo-600 dark:text-indigo-400",
  "text-lime-600 dark:text-lime-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
];

/** Returns a deterministic Tailwind text color class for the given sender name. */
export function getSenderColor(name: string): string {
  return SENDER_COLORS[nameHash(name) % SENDER_COLORS.length];
}

// ─── Initials generation ────────────────────────────────────

/** Generates 2-character initials from a name (splits on - or _). */
export function getInitials(name: string): string {
  const parts = name.split(/[-_]/);
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
