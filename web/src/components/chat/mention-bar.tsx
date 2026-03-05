"use client";

import { MentionChip } from "./mention-chip";

interface MentionBarProps {
  mentions: string[];
  onRemove: (name: string) => void;
  onTriggerAutocomplete: () => void;
  teamMembers: string[];
  disabled?: boolean;
}

/**
 * Renders mention chips only when mentions are selected.
 * Hidden when empty — the @ button and hint are inline in the composer input row.
 */
export function MentionBar({
  mentions,
  onRemove,
  disabled,
}: MentionBarProps) {
  if (mentions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-1 py-1 flex-wrap">
      {mentions.map((name) => (
        <MentionChip
          key={name}
          name={name}
          onRemove={onRemove}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
