"use client";

import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import type { AgentState } from "@/components/shared/status-indicator";
import { Avatar } from "@/components/shared/avatar";
import { useAppState } from "@/providers/app-state-provider";
import { Bot, ChevronRight, Info } from "lucide-react";

interface AgentCardProps {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
  onDetailClick?: () => void;
}

export function AgentCard({ agent, isSelected, onClick, onDetailClick }: AgentCardProps) {
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
      aria-label={`Agent ${agent.name}, status: ${agentState}`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
        isSelected
          ? "bg-cyan-glow/10 glow-cyan"
          : "hover:bg-sidebar-accent"
      )}
    >
      {/* Avatar */}
      <Avatar name={agent.name} size="sm" status={agentState} />

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
            <Bot className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {status?.pendingCount ? (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-glow/15 px-1 text-[10px] font-bold leading-none text-cyan-glow">
              {status.pendingCount}
            </span>
          ) : null}
        </div>
        {logLine && agentState === "running" ? (
          <p className="truncate text-[11px] text-amber-pulse/80 font-mono">
            {logLine}
          </p>
        ) : agentState === "error" && status?.lastRun?.error ? (
          <p className="truncate text-[11px] text-rose-alert/80">
            {status.lastRun.error}
          </p>
        ) : (
          <p className="truncate text-[11px] text-muted-foreground">
            {agent.description || agent.provider}
          </p>
        )}
      </div>

      {onDetailClick ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Details for ${agent.name}`}
          className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDetailClick();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              onDetailClick();
            }
          }}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      ) : (
        status?.pendingCount ? null : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
        )
      )}
    </button>
  );
}
