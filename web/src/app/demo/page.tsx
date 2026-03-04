"use client";

import React, { createContext, useContext, useReducer } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  Agent,
  AgentStatus,
  BottomTab,
  Envelope,
  Team,
  ViewMode,
  ChatSelection,
  TeamSelection,
  CronSchedule,
  DaemonStatus,
} from "@/lib/types";
import {
  MOCK_AGENTS,
  MOCK_STATUSES,
  MOCK_TEAMS,
  MOCK_CRON,
  MOCK_DAEMON,
  MOCK_ENVELOPES,
  MOCK_LOG_LINES,
} from "./mock-data";
import { DemoLeftPanel } from "./demo-left-panel";
import { DemoChatView } from "./demo-chat-view";
import { DemoTeamChat } from "./demo-team-chat";
import { DemoDaemonStatus } from "./demo-daemon-status";
import { DemoTerminal } from "./demo-split-panes";
import { DemoCronPanel } from "./demo-split-panes";

// ─── Demo State ─────────────────────────────────────────────
interface DemoState {
  agents: Agent[];
  agentStatuses: Record<string, AgentStatus["status"]>;
  agentLogLines: Record<string, string>;
  envelopes: Record<string, Envelope[]>;
  teams: Team[];
  cronSchedules: CronSchedule[];
  daemonStatus: DaemonStatus | null;
  view: ViewMode;
  activeTab: BottomTab;
  selectedChat: ChatSelection | null;
  selectedTeam: TeamSelection | null;
  splitPane: "terminal" | "thread" | "cron" | null;
  loading: boolean;
}

type Action =
  | { type: "SET_VIEW"; view: ViewMode }
  | { type: "SET_TAB"; tab: BottomTab }
  | { type: "SELECT_CHAT"; selection: ChatSelection | null }
  | { type: "SELECT_TEAM"; selection: TeamSelection | null }
  | { type: "SET_SPLIT_PANE"; pane: DemoState["splitPane"] };

function demoReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SELECT_CHAT":
      return {
        ...state,
        view: "chat",
        selectedChat: action.selection,
        selectedTeam: null,
      };
    case "SELECT_TEAM":
      return {
        ...state,
        view: "team",
        selectedTeam: action.selection,
        selectedChat: null,
      };
    case "SET_SPLIT_PANE":
      return { ...state, splitPane: action.pane };
    default:
      return state;
  }
}

// ─── Demo Context ───────────────────────────────────────────
export const DemoContext = createContext<{
  state: DemoState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function useDemoContext() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoContext must be within DemoProvider");
  return ctx;
}

function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, {
    agents: MOCK_AGENTS,
    agentStatuses: MOCK_STATUSES,
    agentLogLines: MOCK_LOG_LINES,
    envelopes: { "agent:nex": MOCK_ENVELOPES },
    teams: MOCK_TEAMS,
    cronSchedules: MOCK_CRON,
    daemonStatus: MOCK_DAEMON,
    view: "chat",
    activeTab: "chats",
    selectedChat: { agentName: "nex" },
    selectedTeam: null,
    splitPane: null,
    loading: false,
  });

  return (
    <DemoContext.Provider value={{ state, dispatch }}>
      {children}
    </DemoContext.Provider>
  );
}

// ─── Demo Shell ─────────────────────────────────────────────
function DemoShell() {
  const { state, dispatch } = useDemoContext();

  return (
    <div className="flex h-screen overflow-hidden noise-overlay">
      <DemoLeftPanel />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {state.view === "admin" ? (
            <DemoDaemonStatus />
          ) : state.view === "team" && state.selectedTeam ? (
            <DemoTeamChat />
          ) : state.view === "chat" && state.selectedChat ? (
            <DemoChatView />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-grid">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.04] bg-white/[0.02]">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-cyan-glow/30">
                    <path d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-lg font-semibold text-foreground/80">Hi-Boss Control</h2>
                <p className="text-sm text-muted-foreground/50">Select a conversation to begin</p>
              </div>
            </div>
          )}
        </div>

        {state.splitPane === "terminal" && (
          <div className="w-[420px] shrink-0 overflow-hidden">
            <DemoTerminal />
          </div>
        )}
        {state.splitPane === "cron" && (
          <div className="w-[420px] shrink-0 overflow-hidden">
            <DemoCronPanel />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <TooltipProvider>
      <DemoProvider>
        <DemoShell />
      </DemoProvider>
    </TooltipProvider>
  );
}
