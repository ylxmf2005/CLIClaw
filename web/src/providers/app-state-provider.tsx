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
import { useWebSocket } from "./ws-provider";

// ─── State Shape ─────────────────────────────────────────────
interface AppState {
  agents: Agent[];
  agentStatuses: Record<string, AgentStatus["status"]>;
  agentLogLines: Record<string, string>; // agentName -> last log line
  envelopes: Record<string, Envelope[]>; // "agent:name:chatId" -> envelopes
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

const initialState: AppState = {
  agents: [],
  agentStatuses: {},
  agentLogLines: {},
  envelopes: {},
  teams: [],
  cronSchedules: [],
  daemonStatus: null,
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
  | { type: "SET_LOADING"; loading: boolean };

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
      const key = action.envelope.to;
      const existing = state.envelopes[key] || [];
      return {
        ...state,
        envelopes: {
          ...state.envelopes,
          [key]: [...existing, action.envelope],
        },
      };
    }
    case "SET_TEAMS":
      return { ...state, teams: action.teams };
    case "SET_CRON":
      return { ...state, cronSchedules: action.schedules };
    case "SET_DAEMON_STATUS":
      return { ...state, daemonStatus: action.status };
    case "SET_VIEW":
      return { ...state, view: action.view };
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
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
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
  loadEnvelopes: (address: string) => Promise<void>;
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

  const loadEnvelopes = useCallback(async (address: string) => {
    try {
      const { envelopes } = await api.listEnvelopes({
        to: address,
        status: "done",
        limit: 50,
      });
      dispatch({ type: "SET_ENVELOPES", key: address, envelopes });
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
