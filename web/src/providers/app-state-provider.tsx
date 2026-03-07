"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { usePathname } from "next/navigation";
import type {
  Agent,
  AgentSession,
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
import { parseAddress, setBossTimezone } from "@/lib/utils";
import { useWebSocket } from "./ws-provider";

// ─── State Shape ─────────────────────────────────────────────
interface AppState {
  agents: Agent[];
  agentStatuses: Record<string, AgentStatus["status"]>;
  agentLogLines: Record<string, string>; // agentName -> last log line
  envelopes: Record<string, Envelope[]>; // "agent:name:chatId" -> envelopes
  conversations: Record<string, ChatConversation[]>; // agentName -> conversations
  sessions: Record<string, AgentSession[]>; // agentName -> sessions
  relayStates: Record<string, boolean>; // "agentName:chatId" -> relay on/off
  ptyOutput: Record<string, string[]>; // "agentName:chatId" -> pty output lines
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
  initialLoadError: string | null;
}

const initialState: AppState = {
  agents: [],
  agentStatuses: {},
  agentLogLines: {},
  envelopes: {},
  conversations: {},
  sessions: {},
  relayStates: {},
  ptyOutput: {},
  teams: [],
  cronSchedules: [],
  daemonStatus: null,
  drafts: {},
  view: "chat",
  activeTab: "agents",
  selectedChat: null,
  selectedTeam: null,
  splitPane: null,
  loading: true,
  initialLoadError: null,
};

// ─── Actions ─────────────────────────────────────────────────
type Action =
  | { type: "SET_AGENTS"; agents: Agent[] }
  | { type: "SET_AGENT_STATUS"; name: string; status: AgentStatus["status"] }
  | { type: "AGENT_LOG_LINE"; name: string; line: string }
  | { type: "ADD_AGENT"; agent: Agent }
  | { type: "REMOVE_AGENT"; name: string }
  | { type: "SET_ENVELOPES"; key: string; envelopes: Envelope[] }
  | { type: "ADD_ENVELOPE"; envelope: Envelope; activeChat?: ChatSelection | null }
  | { type: "SET_TEAMS"; teams: Team[] }
  | { type: "SET_CRON"; schedules: CronSchedule[] }
  | { type: "SET_DAEMON_STATUS"; status: DaemonStatus }
  | { type: "SET_VIEW"; view: ViewMode }
  | { type: "SELECT_CHAT"; selection: ChatSelection | null }
  | { type: "SELECT_TEAM"; selection: TeamSelection | null }
  | { type: "SET_SPLIT_PANE"; pane: AppState["splitPane"] }
  | { type: "SET_TAB"; tab: BottomTab }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_INITIAL_LOAD_ERROR"; error: string | null }
  | { type: "SET_DRAFT"; key: string; text: string }
  | { type: "CLEAR_DRAFT"; key: string }
  | { type: "SET_CONVERSATIONS"; agentName: string; conversations: ChatConversation[] }
  | { type: "SET_RELAY_STATE"; key: string; relayOn: boolean }
  | { type: "UPDATE_UNREAD"; agentName: string; chatId: string; delta: number }
  | { type: "PTY_OUTPUT"; agentName: string; chatId?: string; data: string }
  | { type: "UPDATE_ENVELOPE"; envelope: Envelope }
  | { type: "SET_SESSIONS"; agentName: string; sessions: AgentSession[] };

function parseActiveChatSelection(pathname: string): ChatSelection | null {
  const match = pathname.match(/^\/agents\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const agentNameRaw = match[1];
  const chatIdRaw = match[2];
  if (!agentNameRaw || !chatIdRaw) return null;
  let agentName: string;
  let chatId: string;
  try {
    agentName = decodeURIComponent(agentNameRaw);
    chatId = decodeURIComponent(chatIdRaw);
  } catch {
    return null;
  }
  return {
    agentName,
    chatId,
  };
}

function parseAgentAddress(address: string): { name: string; chatId: string | null } | null {
  if (!address.startsWith("agent:")) return null;
  const parts = address.split(":");
  const name = parts[1]?.trim();
  if (!name) return null;
  const rawChatId = parts.length > 2 ? parts.slice(2).join(":").trim() : "";
  return { name, chatId: rawChatId || null };
}

function resolveEnvelopeChatId(envelope: Envelope): string {
  const metadata = envelope.metadata && typeof envelope.metadata === "object"
    ? (envelope.metadata as Record<string, unknown>)
    : undefined;

  if (typeof metadata?.chatScope === "string" && metadata.chatScope.trim()) {
    return metadata.chatScope.trim();
  }

  const fromAddress = parseAddress(envelope.from);
  if (fromAddress.type === "channel" && fromAddress.chatId.trim()) {
    return fromAddress.chatId.trim();
  }

  const toAddress = parseAddress(envelope.to);
  if (toAddress.type === "channel" && toAddress.chatId.trim()) {
    return toAddress.chatId.trim();
  }

  const fromAgent = parseAgentAddress(envelope.from);
  if (fromAgent?.chatId) {
    return fromAgent.chatId;
  }

  const toAgent = parseAgentAddress(envelope.to);
  if (toAgent?.chatId) {
    return toAgent.chatId;
  }

  const chat = metadata?.chat;
  if (chat && typeof chat === "object") {
    const rawChatId = (chat as Record<string, unknown>).id;
    if (typeof rawChatId === "string" && rawChatId.trim()) {
      return rawChatId.trim();
    }
    if (typeof rawChatId === "number" && Number.isFinite(rawChatId)) {
      return String(rawChatId);
    }
  }

  return "default";
}

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
      const chatId = resolveEnvelopeChatId(env);
      const fromAgent = parseAgentAddress(env.from)?.name ?? null;
      const toAgent = parseAgentAddress(env.to)?.name ?? null;
      const activeChat = action.activeChat ?? state.selectedChat;

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

      // Keep team chat timeline updated when envelopes are part of a team scope
      // or when a reply lands on the team's console channel.
      const teamKeys = new Set<string>();
      if (typeof env.metadata?.chatScope === "string" && env.metadata.chatScope.startsWith("team:")) {
        teamKeys.add(env.metadata.chatScope);
      }
      if (env.to.startsWith("channel:console:team-chat-")) {
        const teamName = env.to.slice("channel:console:team-chat-".length);
        if (teamName) {
          teamKeys.add(`team:${teamName}`);
        }
      }
      for (const teamKey of teamKeys) {
        const existing = newEnvelopes[teamKey] || [];
        if (!existing.some((e) => e.id === env.id)) {
          newEnvelopes[teamKey] = [...existing, env];
        }
      }

      // Update conversation preview and unread counts
      const newConversations = { ...state.conversations };
      const agentsToUpdate = [toAgent, fromAgent].filter(Boolean) as string[];
      for (const agentName of agentsToUpdate) {
        const convos = [...(newConversations[agentName] || [])];
        const idx = convos.findIndex((c) => c.chatId === chatId);
        const isSelected =
          activeChat?.agentName === agentName &&
          activeChat?.chatId === chatId;

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
    case "SET_INITIAL_LOAD_ERROR":
      return { ...state, initialLoadError: action.error };
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
              ? { ...c, unreadCount: action.delta === 0 ? 0 : (c.unreadCount ?? 0) + action.delta }
              : c
          ),
        },
      };
    }
    case "PTY_OUTPUT": {
      const key = action.chatId ? `${action.agentName}:${action.chatId}` : action.agentName;
      const existing = state.ptyOutput[key] || [];
      return {
        ...state,
        ptyOutput: {
          ...state.ptyOutput,
          [key]: [...existing, action.data],
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
    case "SET_SESSIONS":
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.agentName]: action.sessions,
        },
      };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  retryInitialLoad: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  refreshTeams: () => Promise<void>;
  refreshCron: () => Promise<void>;
  refreshDaemonStatus: () => Promise<void>;
  loadEnvelopes: (address: string, chatId?: string) => Promise<void>;
  loadConversations: (agentName: string) => Promise<void>;
  loadSessions: (agentName: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { subscribe } = useWebSocket();
  const pathname = usePathname();
  const activeChat = useMemo(() => parseActiveChatSelection(pathname), [pathname]);

  const refreshAgents = useCallback(async () => {
    const { agents } = await api.listAgents();
    dispatch({ type: "SET_AGENTS", agents });

    const statusResults = await Promise.allSettled(
      agents.map((agent) => api.getAgentStatus(agent.name))
    );
    const sessionsResults = await Promise.allSettled(
      agents.map((agent) => api.getAgentSessions(agent.name))
    );
    const conversationsResults = await Promise.allSettled(
      agents.map((agent) => api.getConversations(agent.name))
    );

    let firstError: Error | null = null;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const statusResult = statusResults[i];
      if (statusResult?.status === "fulfilled") {
        dispatch({
          type: "SET_AGENT_STATUS",
          name: agent.name,
          status: statusResult.value.status,
        });
      } else if (!firstError && statusResult?.status === "rejected") {
        firstError = statusResult.reason instanceof Error
          ? statusResult.reason
          : new Error(String(statusResult.reason));
      }

      const sessionsResult = sessionsResults[i];
      if (sessionsResult?.status === "fulfilled") {
        dispatch({ type: "SET_SESSIONS", agentName: agent.name, sessions: sessionsResult.value.sessions });
      } else if (!firstError && sessionsResult?.status === "rejected") {
        firstError = sessionsResult.reason instanceof Error
          ? sessionsResult.reason
          : new Error(String(sessionsResult.reason));
      }

      const conversationsResult = conversationsResults[i];
      if (conversationsResult?.status === "fulfilled") {
        const withAgent = conversationsResult.value.conversations.map((c) => ({ ...c, agentName: agent.name }));
        dispatch({ type: "SET_CONVERSATIONS", agentName: agent.name, conversations: withAgent });
      } else if (!firstError && conversationsResult?.status === "rejected") {
        firstError = conversationsResult.reason instanceof Error
          ? conversationsResult.reason
          : new Error(String(conversationsResult.reason));
      }
    }

    if (firstError) {
      throw firstError;
    }
  }, []);

  const refreshTeams = useCallback(async () => {
    const { teams } = await api.listTeams();
    dispatch({ type: "SET_TEAMS", teams });
  }, []);

  const refreshCron = useCallback(async () => {
    const { schedules } = await api.listCronSchedules();
    dispatch({ type: "SET_CRON", schedules });
  }, []);

  const refreshDaemonStatus = useCallback(async () => {
    const status = await api.getDaemonStatus();
    dispatch({ type: "SET_DAEMON_STATUS", status });
  }, []);

  const loadEnvelopes = useCallback(
    async (address: string, chatId?: string) => {
      try {
        const trimmedAddress = address.trim();
        const agentMatch = /^agent:([^:]+)$/.exec(trimmedAddress);
        const result = (chatId && agentMatch)
          ? await api.getAgentChatMessages({
              agentName: agentMatch[1],
              chatId,
              status: "done",
              limit: 200,
            })
          : await api.listEnvelopes({
              to: trimmedAddress,
              chatId,
              status: "done",
              limit: 50,
            });

        const { envelopes } = result;
        // API returns newest-first; reverse for chronological chat display
        const sorted = [...envelopes].reverse();
        const key = chatId ? `${trimmedAddress}:${chatId}` : trimmedAddress;
        dispatch({ type: "SET_ENVELOPES", key, envelopes: sorted });
      } catch {
        // silent
      }
    },
    []
  );

  const loadSessions = useCallback(async (agentName: string) => {
    try {
      const { sessions } = await api.getAgentSessions(agentName);
      dispatch({ type: "SET_SESSIONS", agentName, sessions });
    } catch {
      // silent
    }
  }, []);

  const loadConversations = useCallback(async (agentName: string) => {
    try {
      const { conversations } = await api.getConversations(agentName);
      // API returns conversations without agentName — inject it
      const withAgent = conversations.map((c) => ({ ...c, agentName }));
      dispatch({ type: "SET_CONVERSATIONS", agentName, conversations: withAgent });
    } catch {
      // silent
    }
  }, []);

  const retryInitialLoad = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    dispatch({ type: "SET_INITIAL_LOAD_ERROR", error: null });
    try {
      await Promise.all([
        refreshAgents(),
        refreshTeams(),
        refreshCron(),
        refreshDaemonStatus(),
      ]);

      try {
        const timeInfo = await api.getDaemonTime();
        if (timeInfo.bossTimezone) {
          setBossTimezone(timeInfo.bossTimezone);
        }
      } catch {
        // Fall back to browser timezone
      }
    } catch (err) {
      dispatch({
        type: "SET_INITIAL_LOAD_ERROR",
        error: err instanceof Error ? err.message : "Unable to connect to daemon API",
      });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [refreshAgents, refreshTeams, refreshCron, refreshDaemonStatus]);

  // Initial data load
  useEffect(() => {
    retryInitialLoad();
  }, [retryInitialLoad]);

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
          const p = event.payload as {
            name?: string;
            status?: AgentStatus["status"];
            agentState?: AgentStatus["status"]["agentState"];
            agentHealth?: AgentStatus["status"]["agentHealth"];
            currentRun?: AgentStatus["status"]["currentRun"];
            lastRun?: AgentStatus["status"]["lastRun"];
            pendingCount?: number;
          };
          if (typeof p.name !== "string") break;
          const status = p.status ?? (
            p.agentState && p.agentHealth
              ? {
                  agentState: p.agentState,
                  agentHealth: p.agentHealth,
                  pendingCount: typeof p.pendingCount === "number" ? p.pendingCount : 0,
                  currentRun: p.currentRun,
                  lastRun: p.lastRun,
                }
              : undefined
          );
          if (!status) break;
          dispatch({ type: "SET_AGENT_STATUS", name: p.name, status });
          break;
        }
        case "agent.log": {
          const p = event.payload as { name: string; line: string };
          dispatch({ type: "AGENT_LOG_LINE", name: p.name, line: p.line });
          break;
        }
        case "envelope.new": {
          const envPayload = event.payload as { envelope: Envelope };
          dispatch({
            type: "ADD_ENVELOPE",
            envelope: envPayload.envelope,
            activeChat,
          });
          break;
        }
        case "envelope.done": {
          const p = event.payload as { id?: string; envelope?: { id: string } };
          const envId = p.id || p.envelope?.id;
          if (envId) {
            dispatch({
              type: "UPDATE_ENVELOPE",
              envelope: { id: envId, status: "done" } as Envelope,
            });
          }
          break;
        }
        case "agent.pty.output": {
          const pty = event.payload as { name: string; chatId?: string; data: string };
          dispatch({ type: "PTY_OUTPUT", agentName: pty.name, chatId: pty.chatId, data: pty.data });
          break;
        }
        case "console.message": {
          const p = event.payload as { chatId: string; envelope: Envelope };
          const metadata = p.envelope.metadata && typeof p.envelope.metadata === "object"
            ? { ...p.envelope.metadata }
            : {};
          if (typeof metadata.chatScope !== "string" || !metadata.chatScope) {
            metadata.chatScope = p.chatId;
          }
          dispatch({
            type: "ADD_ENVELOPE",
            envelope: {
              ...p.envelope,
              metadata,
            },
            activeChat,
          });
          break;
        }
        default:
          break;
      }
    });
  }, [subscribe, activeChat]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        retryInitialLoad,
        refreshAgents,
        refreshTeams,
        refreshCron,
        refreshDaemonStatus,
        loadEnvelopes,
        loadConversations,
        loadSessions,
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
