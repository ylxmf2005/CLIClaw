"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAllMention } from "@/lib/team-mentions";

interface MentionChipProps {
  name: string;
  onRemove: (name: string) => void;
  disabled?: boolean;
}

export function MentionChip({ name, onRemove, disabled }: MentionChipProps) {
  const isAll = isAllMention(name);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        isAll
          ? "bg-cyan-glow/15 text-cyan-glow border border-cyan-glow/30"
          : "bg-accent text-foreground/90 border border-border"
      )}
    >
      <span className="select-none">@{isAll ? "all" : name}</span>
      {!disabled && (
        <button
          type="button"
          onClick={() => onRemove(name)}
          className="ml-0.5 rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50"
          aria-label={`Remove @${isAll ? "all" : name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
