// Hi-Boss frontend types — mirrors daemon types from src/daemon/ipc/types.ts

export type Provider = "claude" | "codex";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type PermissionLevel = "restricted" | "standard" | "privileged" | "admin";
export type EnvelopeStatus = "pending" | "done";
export type AgentRunStatus = "running" | "completed" | "failed" | "cancelled";
export type TeamStatus = "active" | "archived";
export type ParseMode = "plain" | "markdownv2" | "html";
export type CronExecutionMode = "isolated" | "clone" | "inline";
export type AgentState = "running" | "idle";
export type AgentHealth = "ok" | "error" | "unknown";

export interface Agent {
  name: string;
  description?: string;
  workspace?: string;
  provider: Provider;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionLevel: PermissionLevel;
  sessionPolicy?: SessionPolicy;
  bindings: string[];
  createdAt: number;
  lastSeenAt?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionPolicy {
  dailyResetAt?: string;
  idleTimeout?: string;
  maxContextLength?: number;
}

export interface AgentStatus {
  agent: Partial<Agent>;
  bindings: string[];
  effective: {
    workspace: string;
    provider: Provider;
    permissionLevel: PermissionLevel;
  };
  status: {
    agentState: AgentState;
    agentHealth: AgentHealth;
    pendingCount: number;
    currentRun?: {
      id: string;
      startedAt: number;
    };
    lastRun?: {
      id: string;
      startedAt: number;
      completedAt?: number;
      status: AgentRunStatus;
      error?: string;
      contextLength?: number;
    };
  };
}

export interface Envelope {
  id: string;
  from: string;
  to: string;
  fromBoss: boolean;
  content: {
    text?: string;
    attachments?: EnvelopeAttachment[];
  };
  priority?: number;
  deliverAt?: number;
  status: EnvelopeStatus;
  createdAt: number;
  replyToEnvelopeId?: string;
  metadata?: Record<string, unknown>;
}

export interface EnvelopeAttachment {
  source: string;
  filename?: string;
  telegramFileId?: string;
}

export interface Team {
  name: string;
  description?: string;
  status: TeamStatus;
  kind: "manual";
  createdAt: number;
  metadata?: Record<string, unknown>;
  members: string[];
}

export interface TeamMember {
  agentName: string;
  source: "manual";
  createdAt: number;
}

export interface CronSchedule {
  id: string;
  agentName: string;
  cron: string;
  timezone?: string;
  enabled: boolean;
  to: string;
  content: {
    text?: string;
    attachments?: EnvelopeAttachment[];
  };
  metadata?: Record<string, unknown>;
  pendingEnvelopeId?: string;
  nextDeliverAt?: number;
  createdAt: number;
}

export interface AgentSession {
  id: string;
  agentName: string;
  provider: Provider;
  providerSessionId?: string;
  createdAt: number;
  lastActiveAt: number;
  lastAdapterType?: string;
  lastChatId?: string;
}

export interface DaemonStatus {
  running: boolean;
  startTimeMs?: number;
  adapters: string[];
  bindings: Array<{
    agentName: string;
    adapterType: string;
  }>;
  dataDir: string;
}

export interface SetupCheck {
  completed: boolean;
  ready: boolean;
  agents: Array<{
    name: string;
    workspace?: string;
    provider?: string;
  }>;
  userInfo: {
    bossName?: string;
    bossTimezone?: string;
    hasAdminToken: boolean;
    missing: {
      bossName: boolean;
      bossTimezone: boolean;
      adminToken: boolean;
    };
  };
}

// WebSocket event types
export type WsEventType =
  | "envelope.new"
  | "envelope.done"
  | "agent.status"
  | "agent.registered"
  | "agent.deleted"
  | "agent.log"
  | "session.started"
  | "session.ended"
  | "cron.fired"
  | "run.started"
  | "run.completed"
  | "snapshot";

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
  timestamp: number;
}

// UI-specific types
export type ViewMode = "chat" | "team" | "admin" | "settings";
export type BottomTab = "chats" | "agents" | "teams" | "settings";

export interface ChatSelection {
  agentName: string;
  chatId?: string; // undefined = most recent
}

export interface TeamSelection {
  teamName: string;
}
