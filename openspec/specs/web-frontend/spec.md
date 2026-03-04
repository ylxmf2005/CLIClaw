# Web Frontend

A web-based management console and chat interface for Hi-Boss.

## Capabilities

1. **Agent management** — CRUD, configuration, status monitoring
2. **Multi-chat messaging** — Multiple concurrent chats per agent, each with its own session
3. **Team group chat** — Shared conversation with @mention-based selective delivery
4. **Live terminal view** — xterm.js streaming of provider CLI output per chat
5. **Cron scheduling** — Per-chat cron job configuration panel
6. **Full admin console** — Daemon status, setup, adapter bindings

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| API layer | Built-in HTTP + WS in daemon | Native event access, single process, no polling |
| Real-time | WebSocket event streaming | Daemon pushes events directly |
| Chat model | Multiple concurrent chats per agent | Each chat = own session, maps to `agent:<name>:<chat-id>` |
| Terminal | xterm.js + ANSI color | Live provider CLI stdout/stderr per agent/chat |
| Team chat | Shared group chat room | @mention for selective delivery, @all for broadcast |
| Auth model | Admin token login | User authenticates with admin token |
| UI layout | Telegram-style with bottom tab bar | Left panel + bottom tabs + chat + split-pane |
| State management | `AuthProvider` + `WebSocketProvider` + unified reducer (`AppStateProvider`) + `ThemeProvider` | Auth/socket/theme concerns stay isolated while app state remains centralized |
| Repo location | Monorepo (`web/` in Hi-Boss) | Shared types, single build |
| UI components | shadcn/ui + Tailwind CSS | Accessible, customizable |
| File naming | kebab-case | Next.js conventions |

---

## Architecture

### Daemon HTTP + WebSocket Server

Embedded in the daemon process alongside existing IPC server.

```
daemon process
  ├── IPC server (existing Unix socket JSON-RPC)
  ├── HTTP server (new)
  │   ├── REST endpoints → translate to internal RPC calls
  │   ├── WebSocket endpoint → push events to connected clients
  │   └── Static file serving (production)
  └── Core (DB, router, scheduler, executor)
```

### REST API (maps to existing RPC)

| Method | Path | RPC Method |
|---|---|---|
| POST | `/api/auth/login` | `admin.verify` |
| GET | `/api/daemon/status` | `daemon.status` |
| GET | `/api/daemon/time` | `daemon.time` |
| GET | `/api/agents` | `agent.list` |
| POST | `/api/agents` | `agent.register` |
| GET | `/api/agents/:name` | `agent.status` |
| PATCH | `/api/agents/:name` | `agent.set` |
| DELETE | `/api/agents/:name` | `agent.delete` |
| POST | `/api/agents/:name/abort` | `agent.abort` |
| POST | `/api/agents/:name/refresh` | `agent.refresh` |
| POST | `/api/agents/:name/bind` | `agent.bind` |
| DELETE | `/api/agents/:name/bind/:adapter` | `agent.unbind` |
| PATCH | `/api/agents/:name/session-policy` | `agent.session-policy.set` |
| POST | `/api/envelopes` | `envelope.send` |
| GET | `/api/envelopes` | `envelope.list` |
| GET | `/api/envelopes/:id/thread` | `envelope.thread` |
| GET | `/api/teams` | `team.list` |
| POST | `/api/teams` | `team.register` |
| GET | `/api/teams/:name` | `team.status` |
| PATCH | `/api/teams/:name` | `team.set` |
| DELETE | `/api/teams/:name` | `team.delete` |
| GET | `/api/teams/:name/members` | `team.list-members` |
| POST | `/api/teams/:name/members` | `team.add-member` |
| DELETE | `/api/teams/:name/members/:agent` | `team.remove-member` |
| POST | `/api/teams/:name/send` | `team.send` |
| GET | `/api/cron` | `cron.list` |
| POST | `/api/cron` | `cron.create` |
| POST | `/api/cron/:id/enable` | `cron.enable` |
| POST | `/api/cron/:id/disable` | `cron.disable` |
| DELETE | `/api/cron/:id` | `cron.delete` |
| GET | `/api/setup/check` | `setup.check` |

See `openspec/specs/web-frontend/events.md` for WebSocket event details.

---

### Frontend Structure

```
web/src/
  app/                          # Next.js app router
    layout.tsx, page.tsx        # Root layout + main SPA entry
    demo/                       # Static demo (no daemon required)
  components/
    layout/                     # app-shell, left-panel, bottom-tab-bar
    agents/                     # agent-list, agent-card, agent-create-modal
    chat/                       # chat-view, message-list, message-composer
    chats/                      # chat-list-panel, chat-list-item
    terminal/                   # terminal-view (xterm.js)
    teams/                      # team-list, team-chat-view
    cron/                       # cron-panel
    admin/                      # daemon-status
    settings/                   # settings-panel
    shared/                     # login-screen, status-indicator
    ui/                         # shadcn/ui primitives
  providers/
    app-state-provider.tsx      # Unified state
    auth-provider.tsx           # Token auth context
    ws-provider.tsx             # WebSocket connection
  lib/
    api.ts, types.ts, utils.ts  # REST client, types, helpers
```

### State Management

Single unified reducer via `AppStateProvider`:

```
ThemeProvider → AuthProvider → WebSocketProvider → AppStateProvider → AppShell
```

### Key Types

```typescript
interface ChatConversation {
  agentName: string;
  chatId: string;
  label?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  createdAt: number;
}

interface ChatSelection {
  agentName: string;
  chatId: string;
}
```

Envelope lookup key: `agent:<name>:<chatId>`.

---

## UI Layout

Telegram-style with bottom tab bar:

```
+----------------------------------------------------------+
| Left Panel (320px)  |        Main Content                |
|                     |                                    |
| +--- Header ------+ | +--- Chat Header ---------------+ |
| | Hi-Boss  🟢     | | | nex / PR Review    [+] [>_][⏰]| |
| +-----------------+ | +-------------------------------+ |
|                     | |  Message List (auto-scroll)   | |
| (Tab content area)  | |                               | |
|                     | +-------------------------------+ |
|                     | | Composer [+] Message... [↑]   | |
| +-----------------+ | +-------------------------------+ |
| |Agents|Teams|Chats|Settings| ← Bottom Tab Bar         |
| +-----------------+ |                                    |
+----------------------------------------------------------+
```

**Bottom tabs**: Agents, Teams, Chats, Settings

**Main content** (conditional): Agent chat view, team group chat, daemon status dashboard

**Composer**: Plus (+) menu for file attachments (expandable for future actions).

**Split pane** (toggleable): Terminal view (xterm.js), cron panel

---

## Authentication Flow

1. User opens frontend → login screen
2. Enter admin token → `POST /api/auth/login`
3. Token stored in memory (not localStorage)
4. All API calls include token in Authorization header
5. WebSocket established with token in handshake

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (app router, Turbopack) |
| UI components | shadcn/ui + Radix primitives |
| Styling | Tailwind CSS v4 |
| Terminal | xterm.js |
| State | React Context + useReducer |
| Real-time | WebSocket |
| Backend | Built-in HTTP + WS in daemon |

---

## Status

**Implemented**: Next.js scaffolding, Telegram-style layout, theme provider (light/dark toggle), demo page, agent list, multi-chat, chat view, team chat (basic), daemon status (demo), terminal + cron shells, unified state provider, auth/WS provider shells, REST API client, shadcn/ui components, composer plus menu for file attachments.

**Not yet implemented**: Daemon HTTP + WS server, live data wiring, real-time events, xterm.js live stream integration, agent CRUD wiring, team management wiring, cron panel wiring, message composer submission wiring.

## Open Questions

1. HTTP server port configuration (default `3889`?)
2. Dev mode: one command or separate daemon + frontend?
3. Notification sounds for new messages?
4. Cmd+K command palette?
5. Browsable conversation history for closed chats?
6. Full-text search across envelopes?
