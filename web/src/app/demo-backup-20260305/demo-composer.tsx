"use client";

import { MessageComposer } from "@/components/chat/message-composer";

interface DemoComposerProps {
  placeholder: string;
  onSend: (text: string) => void;
  /** Current draft text for this conversation (from parent state). */
  draft?: string;
  /** Called when draft text changes (debounced by composer). */
  onDraftChange?: (text: string) => void;
}

/**
 * Thin wrapper around the unified MessageComposer for demo pages.
 * Forwards text-only sends (attachments are ignored in demo mode).
 */
export function DemoComposer({ placeholder, onSend, draft, onDraftChange }: DemoComposerProps) {
  return (
    <MessageComposer
      placeholder={placeholder}
      onSend={(text, _attachments) => {
        if (text) onSend(text);
      }}
      draft={draft}
      onDraftChange={onDraftChange}
    />
  );
}
