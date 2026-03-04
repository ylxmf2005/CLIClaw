import type {
  Agent,
  AgentStatus,
  Team,
  CronSchedule,
  DaemonStatus,
  Envelope,
} from "@/lib/types";

// Fixed base timestamp to avoid SSR/client hydration mismatch from NOW
export const NOW = 1741100000000; // 2025-03-04T ~19:00 UTC (fixed for demo)

export const MOCK_AGENTS: Agent[] = [
  {
    name: "nex",
    description: "Primary AI assistant",
    workspace: "/home/projects/hi-boss",
    provider: "claude",
    model: "claude-sonnet-4-20250514",
    permissionLevel: "privileged",
    bindings: ["telegram"],
    createdAt: NOW - 86400000 * 7,
    lastSeenAt: NOW - 60000,
  },
  {
    name: "shieru",
    description: "Code review specialist",
    workspace: "/home/projects/hi-boss",
    provider: "claude",
    permissionLevel: "standard",
    bindings: [],
    createdAt: NOW - 86400000 * 3,
    lastSeenAt: NOW - 300000,
  },
  {
    name: "codex-worker",
    description: "Fast task executor",
    provider: "codex",
    permissionLevel: "standard",
    bindings: [],
    createdAt: NOW - 86400000,
  },
  {
    name: "cron-bot",
    description: "Scheduled report generator",
    provider: "claude",
    permissionLevel: "restricted",
    bindings: ["telegram"],
    createdAt: NOW - 86400000 * 14,
    lastSeenAt: NOW - 3600000,
  },
];

export const MOCK_STATUSES: Record<string, AgentStatus["status"]> = {
  nex: {
    agentState: "running",
    agentHealth: "ok",
    pendingCount: 2,
    currentRun: { id: "abc12345", startedAt: NOW - 45000 },
  },
  shieru: {
    agentState: "idle",
    agentHealth: "ok",
    pendingCount: 0,
    lastRun: {
      id: "def67890",
      startedAt: NOW - 600000,
      completedAt: NOW - 300000,
      status: "completed",
      contextLength: 24500,
    },
  },
  "codex-worker": {
    agentState: "idle",
    agentHealth: "ok",
    pendingCount: 0,
  },
  "cron-bot": {
    agentState: "idle",
    agentHealth: "error",
    pendingCount: 1,
    lastRun: {
      id: "ghi11111",
      startedAt: NOW - 7200000,
      completedAt: NOW - 7100000,
      status: "failed",
      error: "Session expired",
    },
  },
};

export const MOCK_TEAMS: Team[] = [
  {
    name: "core-dev",
    description: "Core development team",
    status: "active",
    kind: "manual",
    createdAt: NOW - 86400000 * 5,
    members: ["nex", "shieru", "codex-worker"],
  },
  {
    name: "ops",
    description: "Operations and monitoring",
    status: "active",
    kind: "manual",
    createdAt: NOW - 86400000 * 2,
    members: ["cron-bot"],
  },
];

export const MOCK_CRON: CronSchedule[] = [
  {
    id: "cron0001",
    agentName: "cron-bot",
    cron: "0 9 * * *",
    timezone: "Asia/Tokyo",
    enabled: true,
    to: "agent:nex",
    content: { text: "Generate daily status report" },
    nextDeliverAt: NOW + 3600000 * 4,
    createdAt: NOW - 86400000 * 10,
  },
  {
    id: "cron0002",
    agentName: "nex",
    cron: "0 */6 * * *",
    enabled: false,
    to: "agent:nex",
    content: { text: "Check pending tasks" },
    createdAt: NOW - 86400000 * 3,
  },
];

export const MOCK_DAEMON: DaemonStatus = {
  running: true,
  startTimeMs: NOW - 86400000 * 2 - 3600000 * 5,
  adapters: ["telegram"],
  bindings: [
    { agentName: "nex", adapterType: "telegram" },
    { agentName: "cron-bot", adapterType: "telegram" },
  ],
  dataDir: "~/hiboss/",
};

export const MOCK_ENVELOPES: Envelope[] = [
  {
    id: "env00001",
    from: "channel:telegram:123456",
    to: "agent:nex",
    fromBoss: true,
    content: { text: "Hey nex, can you review the latest PR for the HTTP server changes?" },
    status: "done",
    createdAt: NOW - 300000,
  },
  {
    id: "env00002",
    from: "agent:nex",
    to: "channel:telegram:123456",
    fromBoss: false,
    content: {
      text: "Sure! I'll take a look at the PR now. Let me pull the latest changes and review the HTTP server implementation.\n\nI'll focus on:\n1. REST endpoint structure\n2. WebSocket event handling\n3. Authentication middleware\n4. Error handling patterns",
    },
    status: "done",
    createdAt: NOW - 280000,
  },
  {
    id: "env00003",
    from: "channel:telegram:123456",
    to: "agent:nex",
    fromBoss: true,
    content: { text: "Also check if the CORS config is correct for the dev proxy setup" },
    status: "done",
    createdAt: NOW - 240000,
  },
  {
    id: "env00004",
    from: "agent:nex",
    to: "channel:telegram:123456",
    fromBoss: false,
    content: {
      text: "Good call. I found a couple of issues:\n\n```typescript\n// Current - too permissive\napp.use(cors({ origin: '*' }))\n\n// Should be\napp.use(cors({ origin: 'http://localhost:3456' }))\n```\n\nAlso the WebSocket auth middleware is missing token validation on the upgrade request. I'll fix both.",
    },
    status: "done",
    createdAt: NOW - 200000,
  },
  {
    id: "env00005",
    from: "agent:shieru",
    to: "agent:nex",
    fromBoss: false,
    content: {
      text: "I also noticed the rate limiter isn't applied to the WS endpoint. You might want to add connection-level throttling.",
    },
    status: "done",
    createdAt: NOW - 120000,
  },
];

export const MOCK_LOG_LINES: Record<string, string> = {
  nex: "Reviewing src/daemon/http/server.ts... checking CORS configuration",
};
