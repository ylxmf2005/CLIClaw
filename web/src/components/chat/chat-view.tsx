"use client";

import { useEffect } from "react";
import { useAppState } from "@/providers/app-state-provider";
import { MessageList } from "./message-list";
import { MessageComposer } from "./message-composer";
import {
  StatusIndicator,
  type AgentState,
} from "@/components/shared/status-indicator";
import { Button } from "@/components/ui/button";
import {
  Terminal,
  Clock,
  SquareSlash,
  RefreshCw,
  Plus,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { abortAgent, refreshAgent } from "@/lib/api";

export function ChatView() {
  const { state, dispatch, loadEnvelopes } = useAppState();
  const selection = state.selectedChat;

  useEffect(() => {
    if (selection) {
      const address = selection.chatId
        ? `agent:${selection.agentName}:${selection.chatId}`
        : `agent:${selection.agentName}`;
      loadEnvelopes(address);
    }
  }, [selection, loadEnvelopes]);

  if (!selection) {
    return (
      <div className="flex flex-1 items-center justify-center bg-grid">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.04] bg-white/[0.02]">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              className="text-cyan-glow/30"
            >
              <path
                d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mb-2 font-display text-lg font-semibold text-foreground/80">
            Hi-Boss Control
          </h2>
          <p className="text-sm text-muted-foreground/50">
            Select an agent to start a conversation
          </p>
        </div>
      </div>
    );
  }

  const agent = state.agents.find((a) => a.name === selection.agentName);
  const status = state.agentStatuses[selection.agentName];
  const agentState: AgentState = status
    ? status.agentHealth === "error"
      ? "error"
      : status.agentState === "running"
        ? "running"
        : "idle"
    : "unknown";

  const address = selection.chatId
    ? `agent:${selection.agentName}:${selection.chatId}`
    : `agent:${selection.agentName}`;

  const envelopes = state.envelopes[address] || [];

  return (
    <div className="flex flex-1 flex-col">
      {/* Chat header */}
      <div className="flex h-14 items-center justify-between border-b border-white/[0.04] bg-[#080c16]/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <StatusIndicator state={agentState} size="md" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {selection.agentName}
            </h2>
            {selection.chatId && (
              <span className="text-[11px] font-mono text-muted-foreground/50">
                {selection.chatId}
              </span>
            )}
          </div>
          {agent?.provider && (
            <span className="rounded bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              {agent.provider}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
            onClick={() =>
              dispatch({
                type: "SELECT_CHAT",
                selection: { agentName: selection.agentName, chatId: "new" },
              })
            }
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              state.splitPane === "terminal"
                ? "text-cyan-glow"
                : "text-muted-foreground/50 hover:text-foreground"
            )}
            onClick={() =>
              dispatch({
                type: "SET_SPLIT_PANE",
                pane: state.splitPane === "terminal" ? null : "terminal",
              })
            }
            title="Toggle terminal"
          >
            <Terminal className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              state.splitPane === "cron"
                ? "text-cyan-glow"
                : "text-muted-foreground/50 hover:text-foreground"
            )}
            onClick={() =>
              dispatch({
                type: "SET_SPLIT_PANE",
                pane: state.splitPane === "cron" ? null : "cron",
              })
            }
            title="Toggle cron schedules"
          >
            <Clock className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-4 w-px bg-white/[0.06]" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
            onClick={() => refreshAgent(selection.agentName)}
            title="Refresh session"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          {agentState === "running" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-rose-alert/70 hover:text-rose-alert"
              onClick={() => abortAgent(selection.agentName)}
              title="Abort run"
            >
              <SquareSlash className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
            title="Agent settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Message area */}
      <MessageList envelopes={envelopes} currentAgent={selection.agentName} />

      {/* Inline log preview when agent is running */}
      {agentState === "running" && state.agentLogLines[selection.agentName] && (
        <div className="border-t border-amber-pulse/10 bg-amber-pulse/[0.03] px-4 py-2">
          <p className="mx-auto max-w-3xl truncate font-mono text-[11px] text-amber-pulse/60">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-pulse pulse-amber" />
            {state.agentLogLines[selection.agentName]}
          </p>
        </div>
      )}

      {/* Composer */}
      <MessageComposer
        toAddress={address}
        placeholder={`Message ${selection.agentName}...`}
      />
    </div>
  );
}
