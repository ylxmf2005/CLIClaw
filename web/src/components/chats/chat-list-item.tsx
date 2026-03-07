"use client";

import { cn, formatTime, formatChatLabel } from "@/lib/utils";
import { Avatar } from "@/components/shared/avatar";
import type { AgentState } from "@/components/shared/status-indicator";
import { Pin, Trash2, PinOff } from "lucide-react";
import { useState } from "react";

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
  messageCount?: number;
  adapterTypes?: string[];
  isPinned?: boolean;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onPin?: () => void;
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
  messageCount,
  adapterTypes,
  isPinned,
  isSelected,
  onClick,
  onDelete,
  onPin,
}: ChatListItemProps) {
  const isUnread = !!unreadCount && unreadCount > 0;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="group/item relative">
      {/* Delete confirmation overlay */}
      {confirmingDelete && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95 backdrop-blur-sm px-3">
          <span className="text-[10px] text-rose-alert mr-2">Delete this chat?</span>
          <button
            onClick={() => { onDelete?.(); setConfirmingDelete(false); }}
            className="rounded px-2 py-0.5 text-[10px] font-medium bg-rose-alert/15 text-rose-alert hover:bg-rose-alert/25 transition-colors mr-1"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmingDelete(false)}
            className="rounded px-2 py-0.5 text-[10px] font-medium bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <button
        onClick={onClick}
        aria-label={`${kind === "team" ? "Team" : "Agent"} ${name}${agentState ? `, status: ${agentState}` : ""}`}
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:outline-none",
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
              {isPinned && <Pin className="h-2.5 w-2.5 shrink-0 text-cyan-glow/60" />}
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
              {adapterTypes && adapterTypes.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {adapterTypes.map((at) => (
                    <span
                      key={at}
                      className="rounded bg-accent/80 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground/70"
                    >
                      {at === "telegram" ? "TG" : at === "console" ? "WEB" : at.slice(0, 3).toUpperCase()}
                    </span>
                  ))}
                </span>
              )}
            </span>
            {lastMessageAt && (
              <span className={cn(
                "shrink-0 text-[10px]",
                isUnread && !isSelected ? "text-cyan-glow font-medium" : "text-muted-foreground/50"
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

        {/* Hover action icons */}
        {(onDelete || onPin) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
            {onPin && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onPin(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onPin(); } }}
                title={isPinned ? "Unpin" : "Pin"}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-cyan-glow hover:bg-cyan-glow/10 transition-colors"
              >
                {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </span>
            )}
            {onDelete && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setConfirmingDelete(true); } }}
                title="Delete chat"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-rose-alert hover:bg-rose-alert/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
