"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from "react";
import type {
  Agent,
  AgentStatus,
  BottomTab,
  ChatConversation,
  Envelope,
  Team,
  CronSchedule,
  DaemonStatus,
  ChatSelection,
  TeamSelection,
  ViewMode,
  WsEvent,
} from "@/lib/types";
import * as api from "@/lib/api";
import { setBossTimezone } from "@/lib/utils";
import { useWebSocket } from "./ws-provider";

// ─── State Shape ─────────────────────────────────────────────
interface AppState {
  agents: Agent[];
  agentStatuses: Record<string, AgentStatus["status"]>;
  agentLogLines: Record<string, string>; // agentName -> last log line
  envelopes: Record<string, Envelope[]>; // "agent:name:chatId" -> envelopes
  conversations: Record<string, ChatConversation[]>; // agentName -> conversations
  relayStates: Record<string, boolean>; // "agentName:chatId" -> relay on/off
  ptyOutput: Record<string, string[]>; // agentName -> pty output lines
  teams: Team[];
  cronSchedules: CronSchedule[];
  daemonStatus: DaemonStatus | null;
  drafts: Record<string, string>; // address -> draft text (ephemeral)
  view: ViewMode;
  activeTab: BottomTab;
  selectedChat: ChatSelection | null;
  selectedTeam: TeamSelection | null;
  splitPane: "terminal" | "thread" | "cron" | null;
  loading: boolean;
}

const initialState: AppState = {
  agents: [],
  agentStatuses: {},
  agentLogLines: {},
  envelopes: {},
  conversations: {},
  relayStates: {},
  ptyOutput: {},
  teams: [],
  cronSchedules: [],
  daemonStatus: null,
  drafts: {},
  view: "chat",
  activeTab: "chats",
  selectedChat: null,
  selectedTeam: null,
  splitPane: null,
  loading: true,
};

// ─── Actions ─────────────────────────────────────────────────
type Action =
  | { type: "SET_AGENTS"; agents: Agent[] }
  | { type: "SET_AGENT_STATUS"; name: string; status: AgentStatus["status"] }
  | { type: "AGENT_LOG_LINE"; name: string; line: string }
  | { type: "ADD_AGENT"; agent: Agent }
  | { type: "REMOVE_AGENT"; name: string }
  | { type: "SET_ENVELOPES"; key: string; envelopes: Envelope[] }
  | { type: "ADD_ENVELOPE"; envelope: Envelope }
  | { type: "SET_TEAMS"; teams: Team[] }
  | { type: "SET_CRON"; schedules: CronSchedule[] }
  | { type: "SET_DAEMON_STATUS"; status: DaemonStatus }
  | { type: "SET_VIEW"; view: ViewMode }
  | { type: "SELECT_CHAT"; selection: ChatSelection | null }
  | { type: "SELECT_TEAM"; selection: TeamSelection | null }
  | { type: "SET_SPLIT_PANE"; pane: AppState["splitPane"] }
  | { type: "SET_TAB"; tab: BottomTab }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_DRAFT"; key: string; text: string }
  | { type: "CLEAR_DRAFT"; key: string }
  | { type: "SET_CONVERSATIONS"; agentName: string; conversations: ChatConversation[] }
  | { type: "SET_RELAY_STATE"; key: string; relayOn: boolean }
  | { type: "UPDATE_UNREAD"; agentName: string; chatId: string; delta: number }
  | { type: "PTY_OUTPUT"; agentName: string; data: string }
  | { type: "UPDATE_ENVELOPE"; envelope: Envelope };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_AGENTS":
      return { ...state, agents: action.agents };
    case "SET_AGENT_STATUS":
      return {
        ...state,
        agentStatuses: {
          ...state.agentStatuses,
          [action.name]: action.status,
        },
      };
    case "AGENT_LOG_LINE":
      return {
        ...state,
        agentLogLines: {
          ...state.agentLogLines,
          [action.name]: action.line,
        },
      };
    case "ADD_AGENT":
      return {
        ...state,
        agents: [...state.agents.filter((a) => a.name !== action.agent.name), action.agent],
      };
    case "REMOVE_AGENT":
      return {
        ...state,
        agents: state.agents.filter((a) => a.name !== action.name),
      };
    case "SET_ENVELOPES":
      return {
        ...state,
        envelopes: { ...state.envelopes, [action.key]: action.envelopes },
      };
    case "ADD_ENVELOPE": {
      // Route envelope to both sender's and receiver's conversation views
      const env = action.envelope;
      const chatId = (env.metadata?.chatScope as string) || "default";
      const fromAgent = env.from?.startsWith("agent:") ? env.from.slice(6).split(":")[0] : null;
      const toAgent = env.to?.startsWith("agent:") ? env.to.slice(6).split(":")[0] : null;

      const newEnvelopes = { ...state.envelopes };

      // Add to receiver's conversation
      if (toAgent) {
        const recvKey = `agent:${toAgent}:${chatId}`;
        const existing = newEnvelopes[recvKey] || [];
        if (!existing.some((e) => e.id === env.id)) {
          newEnvelopes[recvKey] = [...existing, env];
        }
      }

      // Add to sender's conversation (for cross-agent visibility)
      if (fromAgent && fromAgent !== toAgent) {
        const sendKey = `agent:${fromAgent}:${chatId}`;
        const existing = newEnvelopes[sendKey] || [];
        if (!existing.some((e) => e.id === env.id)) {
          newEnvelopes[sendKey] = [...existing, env];
        }
      }

      // Also store under the raw to address for backward compat
      const rawKey = env.to;
      if (!newEnvelopes[rawKey]) {
        newEnvelopes[rawKey] = [];
      }
      if (!newEnvelopes[rawKey].some((e) => e.id === env.id)) {
        newEnvelopes[rawKey] = [...newEnvelopes[rawKey], env];
      }

      // Update conversation preview and unread counts
      const newConversations = { ...state.conversations };
      const agentsToUpdate = [toAgent, fromAgent].filter(Boolean) as string[];
      for (const agentName of agentsToUpdate) {
        const convos = [...(newConversations[agentName] || [])];
        const idx = convos.findIndex((c) => c.chatId === chatId);
        const isSelected =
          state.selectedChat?.agentName === agentName &&
          state.selectedChat?.chatId === chatId;

        if (idx >= 0) {
          convos[idx] = {
            ...convos[idx],
            lastMessage: env.content.text?.slice(0, 100),
            lastMessageAt: env.createdAt,
            messageCount: (convos[idx].messageCount ?? 0) + 1,
            unreadCount: isSelected
              ? convos[idx].unreadCount
              : (convos[idx].unreadCount ?? 0) + 1,
          };
        } else {
          // New conversation discovered via WS event
          convos.push({
            agentName,
            chatId,
            lastMessage: env.content.text?.slice(0, 100),
            lastMessageAt: env.createdAt,
            messageCount: 1,
            unreadCount: isSelected ? 0 : 1,
            createdAt: env.createdAt,
          });
        }
        // Sort by most recent
        convos.sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt));
        newConversations[agentName] = convos;
      }

      return { ...state, envelopes: newEnvelopes, conversations: newConversations };
    }
    case "SET_TEAMS":
      return { ...state, teams: action.teams };
    case "SET_CRON":
      return { ...state, cronSchedules: action.schedules };
    case "SET_DAEMON_STATUS":
      return { ...state, daemonStatus: action.status };
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "SELECT_CHAT": {
      // Reset unread count for the selected conversation
      let updatedConversations = state.conversations;
      if (action.selection) {
        const { agentName, chatId } = action.selection;
        const convos = state.conversations[agentName];
        if (convos) {
          const updated = convos.map((c) =>
            c.chatId === chatId ? { ...c, unreadCount: 0 } : c
          );
          updatedConversations = { ...state.conversations, [agentName]: updated };
        }
      }
      return {
        ...state,
        view: "chat",
        selectedChat: action.selection,
        selectedTeam: null,
        conversations: updatedConversations,
      };
    }
    case "SELECT_TEAM":
      return {
        ...state,
        view: "team",
        selectedTeam: action.selection,
        selectedChat: null,
      };
    case "SET_SPLIT_PANE":
      return { ...state, splitPane: action.pane };
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_DRAFT":
      return {
        ...state,
        drafts: { ...state.drafts, [action.key]: action.text },
      };
    case "CLEAR_DRAFT": {
      const { [action.key]: _, ...rest } = state.drafts;
      return { ...state, drafts: rest };
    }
    case "SET_CONVERSATIONS":
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.agentName]: action.conversations,
        },
      };
    case "SET_RELAY_STATE":
      return {
        ...state,
        relayStates: { ...state.relayStates, [action.key]: action.relayOn },
      };
    case "UPDATE_UNREAD": {
      const convos = state.conversations[action.agentName] || [];
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.agentName]: convos.map((c) =>
            c.chatId === action.chatId
              ? { ...c, unreadCount: (c.unreadCount ?? 0) + action.delta }
              : c
          ),
        },
      };
    }
    case "PTY_OUTPUT": {
      const existing = state.ptyOutput[action.agentName] || [];
      return {
        ...state,
        ptyOutput: {
          ...state.ptyOutput,
          [action.agentName]: [...existing, action.data],
        },
      };
    }
    case "UPDATE_ENVELOPE": {
      const updated: Record<string, Envelope[]> = {};
      for (const [key, envs] of Object.entries(state.envelopes)) {
        updated[key] = envs.map((e) =>
          e.id === action.envelope.id ? { ...e, ...action.envelope } : e
        );
      }
      return { ...state, envelopes: updated };
    }
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  refreshAgents: () => Promise<void>;
  refreshTeams: () => Promise<void>;
  refreshCron: () => Promise<void>;
  refreshDaemonStatus: () => Promise<void>;
  loadEnvelopes: (address: string, chatId?: string) => Promise<void>;
  loadConversations: (agentName: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { subscribe } = useWebSocket();

  const refreshAgents = useCallback(async () => {
    try {
      const { agents } = await api.listAgents();
      dispatch({ type: "SET_AGENTS", agents });
      // Fetch status for each agent
      for (const agent of agents) {
        api.getAgentStatus(agent.name).then((s) => {
          dispatch({
            type: "SET_AGENT_STATUS",
            name: agent.name,
            status: s.status,
          });
        });
      }
    } catch {
      // silent on initial load
    }
  }, []);

  const refreshTeams = useCallback(async () => {
    try {
      const { teams } = await api.listTeams();
      dispatch({ type: "SET_TEAMS", teams });
    } catch {
      // silent
    }
  }, []);

  const refreshCron = useCallback(async () => {
    try {
      const { schedules } = await api.listCronSchedules();
      dispatch({ type: "SET_CRON", schedules });
    } catch {
      // silent
    }
  }, []);

  const refreshDaemonStatus = useCallback(async () => {
    try {
      const status = await api.getDaemonStatus();
      dispatch({ type: "SET_DAEMON_STATUS", status });
    } catch {
      // silent
    }
  }, []);

  const loadEnvelopes = useCallback(
    async (address: string, chatId?: string) => {
      try {
        const { envelopes } = await api.listEnvelopes({
          to: address,
          chatId,
          status: "done",
          limit: 50,
        });
        const key = chatId ? `${address}:${chatId}` : address;
        dispatch({ type: "SET_ENVELOPES", key, envelopes });
      } catch {
        // silent
      }
    },
    []
  );

  const loadConversations = useCallback(async (agentName: string) => {
    try {
      const { conversations } = await api.getConversations(agentName);
      dispatch({ type: "SET_CONVERSATIONS", agentName, conversations });
    } catch {
      // silent
    }
  }, []);

  // Initial data load
  useEffect(() => {
    async function init() {
      await Promise.all([
        refreshAgents(),
        refreshTeams(),
        refreshCron(),
        refreshDaemonStatus(),
      ]);
      // Set boss timezone for timestamp display
      try {
        const timeInfo = await api.getDaemonTime();
        if (timeInfo.bossTimezone) {
          setBossTimezone(timeInfo.bossTimezone);
        }
      } catch {
        // Fall back to browser timezone
      }
      dispatch({ type: "SET_LOADING", loading: false });
    }
    init();
  }, [refreshAgents, refreshTeams, refreshCron, refreshDaemonStatus]);

  // Handle WebSocket events
  useEffect(() => {
    return subscribe((event: WsEvent) => {
      switch (event.type) {
        case "agent.registered":
          dispatch({ type: "ADD_AGENT", agent: event.payload as Agent });
          break;
        case "agent.deleted":
          dispatch({
            type: "REMOVE_AGENT",
            name: (event.payload as { name: string }).name,
          });
          break;
        case "agent.status": {
          const p = event.payload as { name: string; status: AgentStatus["status"] };
          dispatch({ type: "SET_AGENT_STATUS", name: p.name, status: p.status });
          break;
        }
        case "agent.log": {
          const p = event.payload as { name: string; line: string };
          dispatch({ type: "AGENT_LOG_LINE", name: p.name, line: p.line });
          break;
        }
        case "envelope.new":
          dispatch({ type: "ADD_ENVELOPE", envelope: event.payload as Envelope });
          break;
        case "envelope.done":
          dispatch({ type: "UPDATE_ENVELOPE", envelope: event.payload as Envelope });
          break;
        case "agent.pty.output": {
          const pty = event.payload as { name: string; data: string };
          dispatch({ type: "PTY_OUTPUT", agentName: pty.name, data: pty.data });
          break;
        }
        default:
          break;
      }
    });
  }, [subscribe]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        refreshAgents,
        refreshTeams,
        refreshCron,
        refreshDaemonStatus,
        loadEnvelopes,
        loadConversations,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be within AppStateProvider");
  return ctx;
}
