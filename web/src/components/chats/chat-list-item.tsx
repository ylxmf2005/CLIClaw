"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import {
  getAvatarColor,
  getInitials,
} from "@/components/agents/agent-card";
import {
  StatusIndicator,
  type AgentState,
} from "@/components/shared/status-indicator";

interface ChatListItemProps {
  kind: "agent" | "team";
  name: string;
  subtitle?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  agentState?: AgentState;
  pendingCount?: number;
  memberCount?: number;
  isSelected: boolean;
  onClick: () => void;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;
  if (diff < 86400000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 86400000 * 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatListItem({
  kind,
  name,
  subtitle,
  lastMessage,
  lastMessageAt,
  agentState,
  pendingCount,
  memberCount,
  isSelected,
  onClick,
}: ChatListItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
        isSelected ? "bg-cyan-glow/8 glow-cyan" : "hover:bg-white/[0.03]"
      )}
    >
      {/* Avatar */}
      {kind === "agent" ? (
        <div
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-lg",
            getAvatarColor(name)
          )}
        >
          {getInitials(name)}
          {agentState && (
            <StatusIndicator
              state={agentState}
              size="sm"
              className="absolute -bottom-0.5 -right-0.5"
            />
          )}
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavender-info/10">
          <Users className="h-4.5 w-4.5 text-lavender-info" />
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isSelected ? "text-cyan-glow" : "text-foreground"
            )}
          >
            {name}
          </span>
          {lastMessageAt && (
            <span className="shrink-0 text-[10px] text-muted-foreground/40">
              {formatTime(lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="truncate text-[11px] text-muted-foreground/60">
            {lastMessage || subtitle || (kind === "team" && memberCount ? `${memberCount} members` : "")}
          </p>
          {!!pendingCount && pendingCount > 0 && (
            <span className="ml-1 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-cyan-glow/15 px-1 text-[10px] font-bold text-cyan-glow">
              {pendingCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
