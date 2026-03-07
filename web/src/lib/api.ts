// REST API client for CLIClaw daemon HTTP server

import type {
  Agent,
  AgentSession,
  AgentStatus,
  ChatConversation,
  CronSchedule,
  DaemonStatus,
  Envelope,
  ChatSettings,
  Provider,
  ReasoningEffort,
  SessionBinding,
  SessionPolicy,
  SetupCheck,
  Team,
  TeamMember,
  CronExecutionMode,
  ParseMode,
  EnvelopeAttachment,
  AuthIdentity,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3889";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error?.message || res.statusText, body);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Auth
export async function login(token: string): Promise<{ valid: boolean; identity?: AuthIdentity }> {
  const res = await apiFetch<{ valid: boolean; identity?: AuthIdentity }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (res.valid) {
    setAuthToken(token);
  }
  return res;
}

export async function getAuthMe(): Promise<{ identity: AuthIdentity }> {
  return apiFetch("/api/auth/me");
}

// Daemon
export async function getDaemonStatus(): Promise<DaemonStatus> {
  return apiFetch("/api/daemon/status");
}

export async function getDaemonTime(): Promise<{
  bossTimezone: string;
  daemonTimezone: string;
}> {
  return apiFetch("/api/daemon/time");
}

export async function getSetupCheck(): Promise<SetupCheck> {
  return apiFetch("/api/setup/check");
}

// Agents
export async function listAgents(): Promise<{ agents: Agent[] }> {
  return apiFetch("/api/agents");
}

export async function getAgentStatus(name: string): Promise<AgentStatus> {
  return apiFetch(`/api/agents/${encodeURIComponent(name)}`);
}

export async function registerAgent(params: {
  name: string;
  description?: string;
  workspace?: string;
  provider?: Provider;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionLevel?: string;
  sessionPolicy?: SessionPolicy;
  bindAdapterType?: string;
  bindAdapterToken?: string;
}): Promise<{ agent: Agent; token: string }> {
  return apiFetch("/api/agents", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function updateAgent(
  name: string,
  params: {
    description?: string | null;
    workspace?: string | null;
    provider?: Provider | null;
    model?: string | null;
    reasoningEffort?: ReasoningEffort | null;
    permissionLevel?: string;
    sessionPolicy?: SessionPolicy | null;
    relayMode?: "default-on" | "default-off" | null;
    metadata?: Record<string, unknown> | null;
    bindAdapterType?: string;
    bindAdapterToken?: string;
    unbindAdapterType?: string;
  }
): Promise<{ success: boolean; agent: Partial<Agent>; bindings: string[] }> {
  return apiFetch(`/api/agents/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function deleteAgent(
  name: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function abortAgent(
  name: string
): Promise<{ success: boolean; cancelledRun: boolean; clearedPendingCount: number }> {
  return apiFetch(`/api/agents/${encodeURIComponent(name)}/abort`, {
    method: "POST",
  });
}

export async function refreshAgent(
  name: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(name)}/refresh`, {
    method: "POST",
  });
}

// Envelopes
export async function sendEnvelope(params: {
  to: string;
  from?: string;
  text?: string;
  attachments?: EnvelopeAttachment[];
  deliverAt?: string;
  interruptNow?: boolean;
  parseMode?: ParseMode;
  replyToEnvelopeId?: string;
  mentions?: string[];
}): Promise<{ id?: string; ids?: string[] }> {
  return apiFetch("/api/envelopes", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function listEnvelopes(params: {
  to?: string;
  from?: string;
  status?: string;
  limit?: number;
  chatId?: string;
  createdAfter?: string;
  createdBefore?: string;
}): Promise<{ envelopes: Envelope[] }> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) query.set(k, String(v));
  }
  return apiFetch(`/api/envelopes?${query}`);
}

export async function getAgentChatMessages(params: {
  agentName: string;
  chatId: string;
  status?: "pending" | "done";
  limit?: number;
}): Promise<{ envelopes: Envelope[] }> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  const querySuffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(
    `/api/agents/${encodeURIComponent(params.agentName)}/chats/${encodeURIComponent(params.chatId)}/messages${querySuffix}`
  );
}

export async function getPtyHistory(params: {
  agentName: string;
  chatId: string;
  limit?: number;
}): Promise<{ chunks: string[] }> {
  const query = new URLSearchParams();
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  const querySuffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(
    `/api/agents/${encodeURIComponent(params.agentName)}/chats/${encodeURIComponent(params.chatId)}/pty-history${querySuffix}`
  );
}

export async function getThread(
  envelopeId: string
): Promise<{ envelopes: Envelope[]; totalCount: number }> {
  return apiFetch(`/api/envelopes/${encodeURIComponent(envelopeId)}/thread`);
}

// Conversations
export async function getConversations(
  agentName: string
): Promise<{ conversations: ChatConversation[] }> {
  const raw = await apiFetch<{
    conversations: Array<{
      chatId: string;
      lastMessageText?: string;
      lastMessageAt?: number;
      messageCount?: number;
      label?: string;
    }>;
  }>(`/api/agents/${encodeURIComponent(agentName)}/conversations`);
  return {
    conversations: raw.conversations.map((c) => ({
      agentName,
      chatId: c.chatId,
      lastMessage: c.lastMessageText,
      lastMessageAt: c.lastMessageAt,
      messageCount: c.messageCount,
      label: c.label,
      createdAt: c.lastMessageAt ?? 0,
    })),
  };
}

// Relay
export async function toggleRelay(
  agentName: string,
  chatId: string,
  on: boolean
): Promise<{ success: boolean; agentName: string; chatId: string; relayOn: boolean }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/chats/${encodeURIComponent(chatId)}/relay`,
    { method: "POST", body: JSON.stringify({ relayOn: on }) }
  );
}

export async function getRelayState(
  agentName: string,
  chatId: string
): Promise<{ agentName: string; chatId: string; relayOn: boolean }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/chats/${encodeURIComponent(chatId)}/relay`
  );
}

export async function getChatSettings(
  agentName: string,
  chatId: string
): Promise<ChatSettings> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/chats/${encodeURIComponent(chatId)}/settings`
  );
}

export async function updateChatSettings(
  agentName: string,
  chatId: string,
  params: {
    modelOverride?: string | null;
    reasoningEffortOverride?: ReasoningEffort | null;
  }
): Promise<ChatSettings & { success: boolean }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/chats/${encodeURIComponent(chatId)}/settings`,
    { method: "PATCH", body: JSON.stringify(params) }
  );
}

// File upload
export async function uploadFile(
  file: File
): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error?.message || res.statusText, body);
  }
  return res.json();
}

// Teams
export async function listTeams(
  status?: string
): Promise<{ teams: Team[] }> {
  const query = status ? `?status=${status}` : "";
  return apiFetch(`/api/teams${query}`);
}

export async function registerTeam(params: {
  name: string;
  description?: string;
}): Promise<{ team: Team }> {
  return apiFetch("/api/teams", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getChatBossContext(
  agentName: string,
  chatId: string,
): Promise<{
  agentName: string;
  chatId: string;
  useBossOverride?: boolean;
  ownerTokenName?: string;
  effectiveUseBoss: boolean;
}> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/chats/${encodeURIComponent(chatId)}/boss-context`);
}

export async function updateChatBossContext(
  agentName: string,
  chatId: string,
  params: {
    useBossOverride: boolean | null;
  },
): Promise<{
  success: boolean;
  agentName: string;
  chatId: string;
  useBossOverride?: boolean;
  ownerTokenName?: string;
  effectiveUseBoss: boolean;
}> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/chats/${encodeURIComponent(chatId)}/boss-context`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function getAgentBossContext(
  agentName: string,
): Promise<{ agentName: string; enabled: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/boss-context`);
}

export async function updateAgentBossContext(
  agentName: string,
  enabled: boolean,
): Promise<{ success: boolean; agentName: string; enabled: boolean }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/boss-context`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function getBossProfileMe(): Promise<{
  profile: {
    tokenName: string;
    name: string;
    version: string;
    content: string;
    metadata: Record<string, string>;
    path: string;
  };
}> {
  return apiFetch("/api/boss-profiles/me");
}

export async function updateBossProfileMe(params: {
  name?: string;
  version?: string;
  content?: string;
  metadata?: Record<string, string>;
}): Promise<{
  success: boolean;
  profile: {
    tokenName: string;
    name: string;
    version: string;
    content: string;
    metadata: Record<string, string>;
    path: string;
  };
}> {
  return apiFetch("/api/boss-profiles/me", {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function listBossProfiles(): Promise<{
  profiles: Array<{
    tokenName: string;
    name: string;
    version?: string;
    role: "admin" | "user";
    content?: string;
    metadata?: Record<string, string>;
    path?: string;
    error?: string;
  }>;
}> {
  return apiFetch("/api/boss-profiles");
}

export async function getBossProfile(tokenName: string): Promise<{
  profile: {
    tokenName: string;
    name: string;
    version: string;
    content: string;
    metadata: Record<string, string>;
    path: string;
  };
}> {
  return apiFetch(`/api/boss-profiles/${encodeURIComponent(tokenName)}`);
}

export async function updateBossProfile(
  tokenName: string,
  params: {
    name?: string;
    version?: string;
    content?: string;
    metadata?: Record<string, string>;
  },
): Promise<{
  success: boolean;
  profile: {
    tokenName: string;
    name: string;
    version: string;
    content: string;
    metadata: Record<string, string>;
    path: string;
  };
}> {
  return apiFetch(`/api/boss-profiles/${encodeURIComponent(tokenName)}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function getAgentSoul(
  agentName: string,
): Promise<{
  soul: {
    version: string;
    content: string;
    path: string;
  };
}> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/soul`);
}

export async function updateAgentSoul(
  agentName: string,
  params: {
    version?: string;
    content?: string;
  },
): Promise<{
  success: boolean;
  soul: {
    version: string;
    content: string;
    path: string;
  };
}> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/soul`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function getTeamStatus(
  name: string
): Promise<{ team: Team }> {
  return apiFetch(`/api/teams/${encodeURIComponent(name)}`);
}

export async function updateTeam(
  name: string,
  params: { description?: string | null; status?: string }
): Promise<{ success: boolean; team: Team }> {
  return apiFetch(`/api/teams/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function deleteTeam(
  name: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/teams/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function listTeamMembers(
  name: string
): Promise<{ members: TeamMember[] }> {
  return apiFetch(`/api/teams/${encodeURIComponent(name)}/members`);
}

export async function addTeamMember(
  teamName: string,
  agentName: string
): Promise<{ success: boolean }> {
  return apiFetch(
    `/api/teams/${encodeURIComponent(teamName)}/members`,
    { method: "POST", body: JSON.stringify({ agentName }) }
  );
}

export async function removeTeamMember(
  teamName: string,
  agentName: string
): Promise<{ success: boolean }> {
  return apiFetch(
    `/api/teams/${encodeURIComponent(teamName)}/members/${encodeURIComponent(agentName)}`,
    { method: "DELETE" }
  );
}

// Cron
export async function listCronSchedules(): Promise<{
  schedules: CronSchedule[];
}> {
  return apiFetch("/api/cron");
}

export async function createCronSchedule(params: {
  cron: string;
  timezone?: string;
  to: string;
  text?: string;
  attachments?: EnvelopeAttachment[];
  executionMode?: CronExecutionMode;
}): Promise<{ id: string }> {
  return apiFetch("/api/cron", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function enableCronSchedule(
  id: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/cron/${encodeURIComponent(id)}/enable`, {
    method: "POST",
  });
}

export async function disableCronSchedule(
  id: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/cron/${encodeURIComponent(id)}/disable`, {
    method: "POST",
  });
}

export async function deleteCronSchedule(
  id: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/cron/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Sessions
export async function getAgentSessions(
  agentName: string
): Promise<{ sessions: AgentSession[] }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/sessions`);
}

export async function createAgentSession(
  agentName: string,
  params: { adapterType: string; chatId?: string }
): Promise<{ session: { id: string; agentName: string; bindings: SessionBinding[] }; chatId: string }> {
  return apiFetch(`/api/agents/${encodeURIComponent(agentName)}/sessions`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function addSessionBinding(
  agentName: string,
  sessionId: string,
  params: { adapterType: string; chatId: string }
): Promise<{ session: { id: string; agentName: string; bindings: SessionBinding[] } }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/sessions/${encodeURIComponent(sessionId)}/bindings`,
    { method: "POST", body: JSON.stringify(params) }
  );
}

export async function updateSession(
  agentName: string,
  sessionId: string,
  params: { label?: string | null; pinned?: boolean }
): Promise<{ session: AgentSession }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "PATCH", body: JSON.stringify(params) }
  );
}

export async function deleteSession(
  agentName: string,
  sessionId: string
): Promise<{ success: boolean; deletedSessionId: string }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
}

export async function removeSessionBinding(
  agentName: string,
  sessionId: string,
  adapterType: string,
  chatId: string
): Promise<{ session: { id: string; agentName: string; bindings: SessionBinding[] } }> {
  return apiFetch(
    `/api/agents/${encodeURIComponent(agentName)}/sessions/${encodeURIComponent(sessionId)}/bindings/${encodeURIComponent(adapterType)}/${encodeURIComponent(chatId)}`,
    { method: "DELETE" }
  );
}
