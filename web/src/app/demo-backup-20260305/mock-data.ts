import type {
  Agent,
  AgentStatus,
  ChatConversation,
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
    workspace: "/home/projects/cliclaw",
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
    workspace: "/home/projects/cliclaw",
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
    metadata: {
      lastMessage: "Thanks! Merging now. @codex-worker the endpoints are ready for test coverage whenever you're free.",
      lastMessageAt: NOW - 60000,
    },
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
  dataDir: "~/cliclaw/",
};

export const MOCK_CONVERSATIONS: ChatConversation[] = [
  {
    agentName: "nex",
    chatId: "pr-review",
    label: "PR Review",
    lastMessage: "I also noticed the rate limiter isn't applied to the WS endpoint.",
    lastMessageAt: NOW - 120000,
    unreadCount: 3,
    createdAt: NOW - 360000,
  },
  {
    agentName: "nex",
    chatId: "cors-debug",
    label: "CORS Debugging",
    lastMessage: "The origin whitelist should include the dev proxy port.",
    lastMessageAt: NOW - 600000,
    createdAt: NOW - 900000,
  },
  {
    agentName: "nex",
    chatId: "daily-standup",
    label: "Daily Standup",
    lastMessage: "All tasks on track. PR #42 ready for merge.",
    lastMessageAt: NOW - 3600000,
    createdAt: NOW - 86400000,
  },
  {
    agentName: "shieru",
    chatId: "code-review-1",
    label: "Code Review",
    lastMessage: "The adapter pattern looks clean. Approved.",
    lastMessageAt: NOW - 300000,
    unreadCount: 1,
    createdAt: NOW - 600000,
  },
  {
    agentName: "shieru",
    chatId: "refactor-plan",
    label: "Refactor Plan",
    lastMessage: "Let's split the router module into sub-routers.",
    lastMessageAt: NOW - 1800000,
    createdAt: NOW - 3600000,
  },
  {
    agentName: "codex-worker",
    chatId: "default",
    label: "General",
    createdAt: NOW - 86400000,
  },
  {
    agentName: "cron-bot",
    chatId: "default",
    label: "General",
    unreadCount: 1,
    createdAt: NOW - 86400000 * 14,
  },
];

export const MOCK_ENVELOPES: Record<string, Envelope[]> = {
  "agent:nex:pr-review": [
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
  ],
  "agent:nex:cors-debug": [
    {
      id: "env00010",
      from: "channel:telegram:123456",
      to: "agent:nex",
      fromBoss: true,
      content: { text: "The dev proxy on port 3456 is getting CORS errors. Can you check?" },
      status: "done",
      createdAt: NOW - 800000,
    },
    {
      id: "env00011",
      from: "agent:nex",
      to: "channel:telegram:123456",
      fromBoss: false,
      content: { text: "The origin whitelist should include the dev proxy port. I'll update the config." },
      status: "done",
      createdAt: NOW - 600000,
    },
  ],
  "agent:nex:daily-standup": [
    {
      id: "env00020",
      from: "agent:nex",
      to: "channel:telegram:123456",
      fromBoss: false,
      content: { text: "All tasks on track. PR #42 ready for merge." },
      status: "done",
      createdAt: NOW - 3600000,
    },
    {
      id: "env00021",
      from: "channel:web:boss",
      to: "agent:nex",
      fromBoss: true,
      content: { text: "Prepare the weekly summary for the team meeting." },
      status: "pending",
      deliverAt: NOW + 3600000 * 2,
      createdAt: NOW - 1800000,
    },
  ],
  "agent:shieru:code-review-1": [
    {
      id: "env00030",
      from: "channel:telegram:123456",
      to: "agent:shieru",
      fromBoss: true,
      content: { text: "Can you review the adapter pattern in src/adapters?" },
      status: "done",
      createdAt: NOW - 500000,
    },
    {
      id: "env00031",
      from: "agent:shieru",
      to: "channel:telegram:123456",
      fromBoss: false,
      content: { text: "The adapter pattern looks clean. Approved." },
      status: "done",
      createdAt: NOW - 300000,
    },
  ],
  "agent:shieru:refactor-plan": [
    {
      id: "env00040",
      from: "agent:shieru",
      to: "channel:telegram:123456",
      fromBoss: false,
      content: { text: "Let's split the router module into sub-routers." },
      status: "done",
      createdAt: NOW - 1800000,
    },
  ],
  "team:core-dev": [
    {
      id: "env00050",
      from: "agent:nex",
      to: "team:core-dev",
      fromBoss: false,
      content: { text: "@all Heads up — I'm starting the HTTP server refactor today. I'll be touching `src/daemon/http/` and the WebSocket handler. Please avoid conflicting changes in that area." },
      status: "done",
      createdAt: NOW - 180000,
    },
    {
      id: "env00051",
      from: "agent:shieru",
      to: "team:core-dev",
      fromBoss: false,
      content: { text: "Got it. I'll hold off on the middleware review until you're done. Let me know when it's safe to proceed." },
      status: "done",
      createdAt: NOW - 160000,
    },
    {
      id: "env00052",
      from: "agent:codex-worker",
      to: "team:core-dev",
      fromBoss: false,
      content: { text: "I can handle the unit tests for the new endpoints once the refactor lands. Just assign them to me." },
      status: "done",
      createdAt: NOW - 140000,
    },
    {
      id: "env00053",
      from: "agent:nex",
      to: "team:core-dev",
      fromBoss: false,
      content: { text: "@shieru Can you review the CORS config before I merge? I changed the origin whitelist and want a second pair of eyes on the security implications." },
      status: "done",
      createdAt: NOW - 100000,
    },
    {
      id: "env00054",
      from: "agent:shieru",
      to: "team:core-dev",
      fromBoss: false,
      content: { text: "Sure, I'll take a look now.\n\n```typescript\n// Looks good — origin is properly scoped\napp.use(cors({ origin: 'http://localhost:3456' }))\n```\n\nApproved. The WS upgrade path also validates the token correctly." },
      status: "done",
      createdAt: NOW - 80000,
    },
    {
      id: "env00055",
      from: "agent:nex",
      to: "team:core-dev",
      fromBoss: false,
      content: { text: "Thanks! Merging now. @codex-worker the endpoints are ready for test coverage whenever you're free." },
      status: "done",
      createdAt: NOW - 60000,
    },
  ],
};

export const MOCK_LOG_LINES: Record<string, string> = {
  nex: "Reviewing src/daemon/http/server.ts... checking CORS configuration",
};

export const MOCK_TERMINAL_LINES: Record<string, string[]> = {
  nex: [
    "$ claude --session nex-abc12345",
    "Starting session...",
    "> Reading PR diff for src/daemon/http/server.ts",
    "Found 3 files changed, 248 additions, 12 deletions",
    "> Analyzing CORS configuration...",
    "Warning: origin set to '*' in development mode",
    "> Checking WebSocket auth middleware...",
    "Issue: Missing token validation on upgrade request",
    "> Reviewing src/daemon/http/server.ts...",
    "Checking CORS configuration",
  ],
  shieru: [
    "$ claude --session shieru-def67890",
    "Starting session...",
    "> Running typecheck on src/cli/commands.ts",
    "Found 0 errors in 42 files",
    "> Analyzing code review for PR #127...",
    "Checking naming conventions against spec",
    "> Reading openspec/specs/cli/commands.md",
    "Verified: all flags match kebab-case convention",
  ],
  "codex-worker": [
    "$ codex --session codex-ghi11223",
    "Starting session...",
    "> Generating test suite for src/daemon/http/routes.ts",
    "Created 12 test cases covering REST endpoints",
    "> Running npm test -- --grep 'http routes'",
    "Tests: 12 passed, 0 failed",
    "> Writing integration tests for WebSocket events...",
  ],
};
