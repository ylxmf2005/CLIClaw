"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { getThread } from "@/lib/api";
import { MessageList } from "./message-list";
import { X, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Envelope } from "@/lib/types";

export function ThreadView() {
  const { state, dispatch } = useAppState();
  const [threadEnvelopes, setThreadEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(false);

  // For now, thread view shows the currently selected conversation's thread
  // In future, a specific envelope ID will be passed to load its thread
  const selection = state.selectedChat;

  useEffect(() => {
    if (!selection) return;

    // Load thread for the most recent envelope in the current conversation
    const envelopeKey = `agent:${selection.agentName}:${selection.chatId}`;
    const envs = state.envelopes[envelopeKey] || [];
    const lastEnv = envs[envs.length - 1];

    if (!lastEnv?.id) return;

    let cancelled = false;
    setLoading(true);

    getThread(lastEnv.id)
      .then(({ envelopes }) => {
        if (!cancelled) setThreadEnvelopes(envelopes);
      })
      .catch(() => {
        if (!cancelled) setThreadEnvelopes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selection, state.envelopes]);

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-cyan-glow" />
          <span className="text-xs font-semibold text-foreground">Thread</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => dispatch({ type: "SET_SPLIT_PANE", pane: null })}
          aria-label="Close thread"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Thread content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">Loading thread...</p>
        </div>
      ) : threadEnvelopes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">No thread to display</p>
        </div>
      ) : (
        <MessageList
          envelopes={threadEnvelopes}
          currentAgent={selection?.agentName}
        />
      )}
    </div>
  );
}
