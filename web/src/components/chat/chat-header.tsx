"use client";

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
  Zap,
  Radio,
} from "lucide-react";
import { cn, formatChatLabel } from "@/lib/utils";
import type { Agent } from "@/lib/types";

export interface ChatHeaderProps {
  agentName: string;
  chatId: string;
  agentState: AgentState;
  provider?: string;
  splitPane: string | null;
  interruptMode: boolean;
  onToggleInterrupt: () => void;
  onNewChat: () => void;
  onToggleTerminal: () => void;
  onToggleCron: () => void;
  onToggleThread: () => void;
  onRefresh: () => void;
  onAbort: () => void;
  isRunning: boolean;
  agent?: Agent;
  lastRunError?: string;
  onOpenDetail: () => void;
  relayOn: boolean;
  relayAvailable: boolean;
  onToggleRelay: () => void;
}

export function ChatHeader({
  agentName,
  chatId,
  agentState,
  provider,
  splitPane,
  interruptMode,
  onToggleInterrupt,
  onNewChat,
  onToggleTerminal,
  onToggleCron,
  onRefresh,
  onAbort,
  isRunning,
  lastRunError,
  onOpenDetail,
  relayOn,
  relayAvailable,
  onToggleRelay,
}: ChatHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <StatusIndicator state={agentState} size="md" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{agentName}</h2>
          <div className="flex items-center gap-1.5">
            {chatId && chatId !== "default" && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {formatChatLabel(chatId)}
              </span>
            )}
            {lastRunError && (
              <span className="truncate text-[10px] text-rose-alert" title={lastRunError}>
                {lastRunError}
              </span>
            )}
          </div>
        </div>
        {provider && (
          <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {provider}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Interrupt toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            interruptMode
              ? "text-amber-pulse"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={onToggleInterrupt}
          title={interruptMode ? "Interrupt mode ON" : "Interrupt mode OFF"}
          aria-label="Toggle interrupt mode"
          aria-pressed={interruptMode}
        >
          <Zap className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onNewChat}
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            relayOn
              ? "text-emerald-signal"
              : "text-muted-foreground hover:text-foreground",
            !relayAvailable && "opacity-50 cursor-not-allowed"
          )}
          onClick={onToggleRelay}
          disabled={!relayAvailable}
          title={
            !relayAvailable
              ? "Relay broker unavailable"
              : relayOn
                ? "Relay ON (interactive terminal)"
                : "Relay OFF (read-only terminal)"
          }
          aria-label="Toggle relay mode"
          aria-pressed={relayOn}
        >
          <Radio className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            splitPane === "terminal"
              ? "text-cyan-glow"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={onToggleTerminal}
          title="Toggle terminal"
          aria-label="Toggle terminal"
          aria-pressed={splitPane === "terminal"}
        >
          <Terminal className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            splitPane === "cron"
              ? "text-cyan-glow"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={onToggleCron}
          title="Toggle cron schedules"
          aria-label="Toggle cron schedules"
          aria-pressed={splitPane === "cron"}
        >
          <Clock className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          title="Refresh session"
          aria-label="Refresh session"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        {isRunning && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-rose-alert/70 hover:text-rose-alert"
            onClick={onAbort}
            title="Abort run"
            aria-label="Abort run"
          >
            <SquareSlash className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onOpenDetail}
          title="Agent details"
          aria-label="Agent details"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
