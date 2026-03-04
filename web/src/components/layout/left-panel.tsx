"use client";

import { useAppState } from "@/providers/app-state-provider";
import { useWebSocket } from "@/providers/ws-provider";
import { BottomTabBar } from "./bottom-tab-bar";
import { AgentList } from "@/components/agents/agent-list";
import { TeamList } from "@/components/teams/team-list";
import { ChatListPanel } from "@/components/chats/chat-list-panel";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

interface LeftPanelProps {
  onCreateAgent: () => void;
  onCreateTeam: () => void;
}

export function LeftPanel({ onCreateAgent, onCreateTeam }: LeftPanelProps) {
  const { state, dispatch } = useAppState();
  const { status } = useWebSocket();

  return (
    <div className="flex h-full w-80 flex-col border-r border-white/[0.04] bg-sidebar">
      {/* Header */}
      <div className="scanline relative flex h-14 items-center gap-3 border-b border-white/[0.04] px-4 overflow-hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 32 32"
            fill="none"
            className="text-cyan-glow"
          >
            <path d="M16 2L2 9l14 7 14-7-14-7z" fill="currentColor" opacity="0.3" />
            <path
              d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold tracking-tight text-foreground">
            Hi-Boss
          </h1>
          <div className="flex items-center gap-1.5">
            {status === "connected" ? (
              <Wifi className="h-2.5 w-2.5 text-emerald-signal" />
            ) : status === "connecting" ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-pulse" />
            ) : (
              <WifiOff className="h-2.5 w-2.5 text-rose-alert" />
            )}
            <span className="text-[10px] text-muted-foreground/50">
              {status === "connected"
                ? "Connected"
                : status === "connecting"
                  ? "Reconnecting..."
                  : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {state.activeTab === "chats" && <ChatListPanel />}
          {state.activeTab === "agents" && (
            <AgentList onCreateAgent={onCreateAgent} />
          )}
          {state.activeTab === "teams" && (
            <TeamList onCreateTeam={onCreateTeam} />
          )}
          {state.activeTab === "settings" && (
            <SettingsPanel
              onDaemonStatus={() =>
                dispatch({ type: "SET_VIEW", view: "admin" })
              }
            />
          )}
        </div>
      </ScrollArea>

      {/* Bottom tab bar */}
      <BottomTabBar
        activeTab={state.activeTab}
        onTabChange={(tab) => dispatch({ type: "SET_TAB", tab })}
      />
    </div>
  );
}
