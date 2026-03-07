"use client";

import React, { createContext, useContext, useReducer } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  Agent,
  AgentStatus,
  BottomTab,
  ChatConversation,
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
  MOCK_CONVERSATIONS,
  MOCK_LOG_LINES,
  MOCK_TERMINAL_LINES,
} from "./mock-data";
import { DemoLeftPanel } from "./demo-left-panel";
import { DemoChatView } from "./demo-chat-view";
import { DemoTeamChat } from "./demo-team-chat";
import { DemoDaemonStatus } from "./demo-daemon-status";
import { DemoTerminal } from "./demo-split-panes";
import { DemoCronPanel } from "./demo-split-panes";

// ─── Demo State ─────────────────────────────────────────────
export interface DemoState {
  agents: Agent[];
  agentStatuses: Record<string, AgentStatus["status"]>;
  agentLogLines: Record<string, string>;
  conversations: ChatConversation[];
  envelopes: Record<string, Envelope[]>;
  teams: Team[];
  cronSchedules: CronSchedule[];
  daemonStatus: DaemonStatus | null;
  drafts: Record<string, string>;
  view: ViewMode;
  activeTab: BottomTab;
  selectedChat: ChatSelection | null;
  selectedTeam: TeamSelection | null;
  terminalAgent: string | null;
  terminalLines: Record<string, string[]>;
  splitPane: "terminal" | "thread" | "cron" | null;
  loading: boolean;
}

export type Action =
  | { type: "SET_VIEW"; view: ViewMode }
  | { type: "SET_TAB"; tab: BottomTab }
  | { type: "SELECT_CHAT"; selection: ChatSelection | null }
  | { type: "SELECT_TEAM"; selection: TeamSelection | null }
  | { type: "SET_TERMINAL_AGENT"; agent: string | null }
  | { type: "SET_SPLIT_PANE"; pane: DemoState["splitPane"] }
  | { type: "ADD_CONVERSATION"; conversation: ChatConversation }
  | { type: "SET_CONVERSATIONS"; conversations: ChatConversation[] }
  | { type: "ADD_ENVELOPE"; to: string; chatId?: string; text: string }
  | { type: "MARK_READ"; agentName: string; chatId: string }
  | { type: "SET_DRAFT"; key: string; text: string }
  | { type: "CLEAR_DRAFT"; key: string };

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
    case "SET_TERMINAL_AGENT":
      return { ...state, terminalAgent: action.agent };
    case "SET_SPLIT_PANE":
      return { ...state, splitPane: action.pane, terminalAgent: action.pane === null ? null : state.terminalAgent };
    case "ADD_CONVERSATION":
      return { ...state, conversations: [...state.conversations, action.conversation] };
    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };
    case "ADD_ENVELOPE": {
      const id = `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      const env: Envelope = {
        id,
        from: "channel:web:boss",
        to: action.to,
        fromBoss: true,
        content: { text: action.text },
        status: "done",
        createdAt: now,
      };
      // Determine envelope list key
      const key = action.to.startsWith("team:")
        ? action.to
        : `${action.to}:${action.chatId ?? "default"}`;
      const updatedEnvelopes = {
        ...state.envelopes,
        [key]: [...(state.envelopes[key] || []), env],
      };
      // Update conversation metadata
      const updatedConversations = state.conversations.map((c) => {
        if (action.chatId && c.agentName === action.to.replace("agent:", "") && c.chatId === action.chatId) {
          return { ...c, lastMessage: action.text, lastMessageAt: now };
        }
        return c;
      });
      // Update team metadata
      const updatedTeams = state.teams.map((t) => {
        if (action.to === `team:${t.name}`) {
          return { ...t, metadata: { ...t.metadata, lastMessage: action.text, lastMessageAt: now } };
        }
        return t;
      });
      return { ...state, envelopes: updatedEnvelopes, conversations: updatedConversations, teams: updatedTeams };
    }
    case "MARK_READ": {
      const updatedConversations = state.conversations.map((c) => {
        if (c.agentName === action.agentName && c.chatId === action.chatId) {
          return { ...c, unreadCount: 0 };
        }
        return c;
      });
      return { ...state, conversations: updatedConversations };
    }
    case "SET_DRAFT":
      return {
        ...state,
        drafts: { ...state.drafts, [action.key]: action.text },
      };
    case "CLEAR_DRAFT": {
      const { [action.key]: _, ...restDrafts } = state.drafts;
      return { ...state, drafts: restDrafts };
    }
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
    conversations: MOCK_CONVERSATIONS,
    envelopes: MOCK_ENVELOPES,
    teams: MOCK_TEAMS,
    cronSchedules: MOCK_CRON,
    daemonStatus: MOCK_DAEMON,
    drafts: {},
    terminalAgent: null,
    terminalLines: MOCK_TERMINAL_LINES,
    view: "chat",
    activeTab: "chats",
    selectedChat: { agentName: "nex", chatId: "pr-review" },
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
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-cyan-glow/30">
                    <path d="M16 2L2 9l14 7 14-7-14-7zM2 23l14 7 14-7M2 16l14 7 14-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-lg font-semibold text-foreground/80">CLIClaw Control</h2>
                <p className="text-sm text-muted-foreground">Select a conversation to begin</p>
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
