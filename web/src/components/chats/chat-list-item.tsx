"use client";

import { cn, formatTime } from "@/lib/utils";
import { Avatar } from "@/components/shared/avatar";
import type { AgentState } from "@/components/shared/status-indicator";

interface ChatListItemProps {
  kind: "agent" | "team";
  name: string;
  chatLabel?: string;
  subtitle?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  agentState?: AgentState;
  pendingCount?: number;
  memberCount?: number;
  unreadCount?: number;
  isSelected: boolean;
  onClick: () => void;
}

export function ChatListItem({
  kind,
  name,
  chatLabel,
  subtitle,
  lastMessage,
  lastMessageAt,
  agentState,
  pendingCount,
  memberCount,
  unreadCount,
  isSelected,
  onClick,
}: ChatListItemProps) {
  const isUnread = !!unreadCount && unreadCount > 0;
  return (
    <button
      onClick={onClick}
      aria-label={`${kind === "team" ? "Team" : "Agent"} ${name}${agentState ? `, status: ${agentState}` : ""}`}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
        isSelected ? "bg-cyan-glow/10 glow-cyan" : "hover:bg-sidebar-accent"
      )}
    >
      {/* Avatar */}
      <Avatar
        name={name}
        size="md"
        team={kind === "team"}
        status={kind === "agent" ? agentState : undefined}
      />

      {/* Unread dot indicator */}
      {isUnread && !isSelected && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-cyan-glow" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 truncate">
            <span
              className={cn(
                "truncate text-sm",
                isSelected ? "text-cyan-glow font-medium" : isUnread ? "text-foreground font-semibold" : "text-foreground font-medium"
              )}
            >
              {name}
            </span>
            {chatLabel && (
              <span className={cn(
                "truncate text-[11px]",
                isUnread && !isSelected ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
              )}>
                / {chatLabel}
              </span>
            )}
          </span>
          {lastMessageAt && (
            <span className={cn(
              "shrink-0 text-[10px]",
              isUnread && !isSelected ? "text-cyan-glow font-medium" : "text-muted-foreground/70"
            )}>
              {formatTime(lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className={cn(
            "truncate text-[11px]",
            isUnread && !isSelected ? "text-foreground/80 font-medium" : "text-muted-foreground"
          )}>
            {lastMessage || subtitle || (kind === "team" && memberCount ? `${memberCount} members` : "")}
          </p>
          {isUnread && !isSelected ? (
            <span className="ml-1 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-cyan-glow px-1 text-[10px] font-bold text-background">
              {unreadCount}
            </span>
          ) : !!pendingCount && pendingCount > 0 ? (
            <span className="ml-1 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-cyan-glow/15 px-1 text-[10px] font-bold text-cyan-glow">
              {pendingCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
