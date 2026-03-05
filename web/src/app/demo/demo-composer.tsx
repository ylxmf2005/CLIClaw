"use client";

import { MessageComposer } from "@/components/chat/message-composer";

interface DemoComposerProps {
  placeholder: string;
  onSend: (text: string) => void;
  /** Current draft text for this conversation (from parent state). */
  draft?: string;
  /** Called when draft text changes (debounced by composer). */
  onDraftChange?: (text: string) => void;
  /** Called when a slash command is invoked (e.g., "/interrupt"). */
  onSlashCommand?: (command: string) => void;
}

/** Slash commands available in the composer autocomplete. */
const DEMO_SLASH_COMMANDS = [
  { command: "interrupt", description: "Toggle interrupt mode for urgent messages" },
  { command: "abort", description: "Abort the current agent run" },
  { command: "refresh", description: "Refresh the agent session" },
];

/**
 * Thin wrapper around the unified MessageComposer for demo pages.
 * Forwards text-only sends (attachments are ignored in demo mode).
 * Handles slash commands with autocomplete.
 */
export function DemoComposer({ placeholder, onSend, draft, onDraftChange, onSlashCommand }: DemoComposerProps) {
  return (
    <MessageComposer
      placeholder={placeholder}
      onSend={(text, _attachments) => {
        if (!text) return;
        // Check for slash command
        if (text.startsWith("/") && onSlashCommand) {
          const cmd = text.slice(1).split(/\s/)[0].toLowerCase();
          if (DEMO_SLASH_COMMANDS.some((sc) => sc.command === cmd)) {
            onSlashCommand(cmd);
            return;
          }
        }
        onSend(text);
      }}
      draft={draft}
      onDraftChange={onDraftChange}
      slashCommands={DEMO_SLASH_COMMANDS}
    />
  );
}
