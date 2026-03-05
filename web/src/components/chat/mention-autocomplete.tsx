"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

interface MentionAutocompleteProps {
  members: string[];
  currentMentions: string[];
  filter: string;
  onSelect: (name: string) => void;
  onDismiss: () => void;
  /** Anchor point for positioning (bottom-left of trigger area) */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function MentionAutocomplete({
  members,
  currentMentions,
  filter,
  onSelect,
  onDismiss,
  anchorRef,
}: MentionAutocompleteProps) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const currentSet = new Set(currentMentions.map((m) => m.toLowerCase()));
  const hasAll = currentSet.has("@all") || currentSet.has("all");

  // Build filtered item list: @all first, then unmentioned members
  const items: Array<{ label: string; value: string; isAll: boolean }> = [];

  if (!hasAll && !currentSet.has("@all")) {
    items.push({ label: "@all", value: "@all", isAll: true });
  }

  for (const member of members) {
    if (currentSet.has(member.toLowerCase())) continue;
    items.push({ label: member, value: member, isAll: false });
  }

  const filtered = filter.length > 0
    ? items.filter((item) => {
        const search = filter.toLowerCase();
        if (item.isAll) return "all".startsWith(search);
        return item.label.toLowerCase().startsWith(search);
      })
    : items;

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filter]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const highlighted = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    highlighted?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  // Keyboard handler attached to window
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = filtered[highlightIndex];
        if (item) onSelect(item.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    },
    [filtered, highlightIndex, onSelect, onDismiss]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  if (filtered.length === 0) {
    return null;
  }

  // Position the dropdown above the anchor
  const style: React.CSSProperties = {};
  if (anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    style.position = "fixed";
    style.bottom = window.innerHeight - rect.top + 4;
    style.left = rect.left;
    style.minWidth = Math.max(200, rect.width);
    style.maxWidth = 320;
  }

  return (
    <div
      ref={listRef}
      className="z-50 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
      style={style}
      role="listbox"
      aria-label="Mention suggestions"
    >
      {filtered.map((item, i) => (
        <button
          key={item.value}
          type="button"
          role="option"
          aria-selected={i === highlightIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.value);
          }}
          onMouseEnter={() => setHighlightIndex(i)}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
            i === highlightIndex
              ? "bg-accent text-foreground"
              : "text-foreground/80 hover:bg-accent/50"
          )}
        >
          {item.isAll ? (
            <>
              <Users className="h-3.5 w-3.5 text-cyan-glow shrink-0" />
              <span className="font-medium text-cyan-glow">@all</span>
              <span className="text-[11px] text-muted-foreground">Everyone in team</span>
            </>
          ) : (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-foreground/70 shrink-0">
                {item.label.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium">@{item.label}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
