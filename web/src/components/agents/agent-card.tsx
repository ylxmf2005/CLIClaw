"use client";

import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import {
  StatusIndicator,
  type AgentState,
} from "@/components/shared/status-indicator";
import { useAppState } from "@/providers/app-state-provider";
import { Bot, ChevronRight } from "lucide-react";

// Deterministic color from agent name
export const AVATAR_COLORS = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
  "from-lime-500 to-green-600",
  "from-fuchsia-500 to-purple-600",
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  const parts = name.split(/[-_]/);
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface AgentCardProps {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  const { state } = useAppState();
  const status = state.agentStatuses[agent.name];
  const logLine = state.agentLogLines[agent.name];

  const agentState: AgentState = status
    ? status.agentHealth === "error"
      ? "error"
      : status.agentState === "running"
        ? "running"
        : "idle"
    : "unknown";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
        isSelected
          ? "bg-cyan-glow/8 glow-cyan"
          : "hover:bg-white/[0.03]"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-lg",
          getAvatarColor(agent.name)
        )}
      >
        {getInitials(agent.name)}
        <StatusIndicator
          state={agentState}
          size="sm"
          className="absolute -bottom-0.5 -right-0.5"
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isSelected ? "text-cyan-glow" : "text-foreground"
            )}
          >
            {agent.name}
          </span>
          {agent.bindings.length > 0 && (
            <Bot className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          )}
        </div>
        {logLine && agentState === "running" ? (
          <p className="truncate text-[11px] text-amber-pulse/70 font-mono">
            {logLine}
          </p>
        ) : (
          <p className="truncate text-[11px] text-muted-foreground">
            {agent.description || agent.provider}
          </p>
        )}
      </div>

      {/* Pending count */}
      {status?.pendingCount ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-glow/15 px-1.5 text-[10px] font-bold text-cyan-glow">
          {status.pendingCount}
        </span>
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
