# Web Frontend

A web management console and chat interface for CLIClaw, backed by the daemon's built-in HTTP and WebSocket servers.

## Capabilities

1. Agent management (list/register/update/delete, status, refresh, abort)
2. Envelope messaging and thread/history viewing
3. Conversation list and chat-scoped relay toggle controls
4. Team and membership management
5. Cron schedule management
6. File upload for envelope attachments
7. Real-time updates via daemon WebSocket events and initial snapshot

## Architecture

Daemon-side web stack is embedded in the same daemon process as IPC/routing/execution.

```
daemon process
  ├── IPC server (Unix socket JSON-RPC)
  ├── HTTP server (Node native http)
  │   └── /api/* routes (thin RPC wrappers + upload endpoint)
  ├── WebSocket endpoint (/ws on HTTP upgrade)
  │   └── daemon event stream + snapshot
  └── Core (DB, scheduler, router, executor, adapters)
```

Key implementation files:
- `src/daemon/http/server.ts`
- `src/daemon/http/routes*.ts`
- `src/daemon/ws/server.ts`
- `src/daemon/events/event-bus.ts`

## HTTP Server Behavior

- Default listen port: `3889` (override with `CLICLAW_HTTP_PORT`)
- JSON request parsing for `Content-Type: application/json`
- Bearer-token extraction from `Authorization: Bearer <token>`
- CORS headers for browser clients (`GET, POST, PATCH, DELETE, OPTIONS`)
- RPC error mapping:
  - `-32001` -> HTTP `401`
  - `-32002` -> HTTP `404`
  - `-32003` -> HTTP `409`
  - `-32602` -> HTTP `400`
- Request body limits:
  - JSON: 11MB parser guard
  - Upload endpoint: 10MB file limit

## Authentication Model

- Login endpoint validates an admin token via `admin.verify`.
- Frontend stores token in `sessionStorage` key `cliclaw_token`.
- API calls send `Authorization: Bearer <token>`.
- WebSocket connection uses query token: `/ws?token=<token>`.
- WebSocket upgrade currently requires a valid admin token.

## REST API

Routes are registered in `src/daemon/http/routes.ts`.

### Bootstrap / Auth (no bearer token required)

| Method | Path | RPC / Behavior |
|---|---|---|
| POST | `/api/auth/login` | `admin.verify` |
| GET | `/api/setup/check` | `setup.check` |

### Daemon

| Method | Path | RPC |
|---|---|---|
| GET | `/api/daemon/status` | `daemon.status` |
| GET | `/api/daemon/time` | `daemon.time` |

### Agents

| Method | Path | RPC |
|---|---|---|
| GET | `/api/agents` | `agent.list` |
| POST | `/api/agents` | `agent.register` |
| GET | `/api/agents/:name` | `agent.status` |
| PATCH | `/api/agents/:name` | `agent.set` |
| DELETE | `/api/agents/:name` | `agent.delete` |
| POST | `/api/agents/:name/abort` | `agent.abort` |
| POST | `/api/agents/:name/refresh` | `agent.refresh` |
| GET | `/api/agents/:name/conversations` | `envelope.conversations` |

Notes:
- `envelope.conversations` is admin-only under default permission policy.

### Envelopes

| Method | Path | RPC |
|---|---|---|
| POST | `/api/envelopes` | `envelope.send` |
| GET | `/api/envelopes` | `envelope.list` |
| GET | `/api/envelopes/:id/thread` | `envelope.thread` |

### Sessions / Chat Relay

| Method | Path | RPC / Behavior |
|---|---|---|
| GET | `/api/sessions?agentName=<name>` | `session.list` |
| POST | `/api/agents/:name/chats/:chatId/relay` | `chat.relay-toggle` |
| GET | `/api/agents/:name/chats/:chatId/relay` | direct read from `chat_state` (same auth/permission gate as `chat.relay-toggle`) |

### Upload

| Method | Path | RPC / Behavior |
|---|---|---|
| POST | `/api/upload` | multipart upload to daemon media storage (requires `envelope.send` permission) |

### Teams

| Method | Path | RPC |
|---|---|---|
| GET | `/api/teams` | `team.list` |
| POST | `/api/teams` | `team.register` |
| GET | `/api/teams/:name` | `team.status` |
| PATCH | `/api/teams/:name` | `team.set` |
| DELETE | `/api/teams/:name` | `team.delete` |
| GET | `/api/teams/:name/members` | `team.list-members` |
| POST | `/api/teams/:name/members` | `team.add-member` |
| DELETE | `/api/teams/:name/members/:agentName` | `team.remove-member` |

Note:
- There is no `/api/teams/:name/send` HTTP route; team fan-out send remains CLI/RPC (`team.send`).

### Cron

| Method | Path | RPC |
|---|---|---|
| GET | `/api/cron` | `cron.list` |
| POST | `/api/cron` | `cron.create` |
| POST | `/api/cron/:id/enable` | `cron.enable` |
| POST | `/api/cron/:id/disable` | `cron.disable` |
| DELETE | `/api/cron/:id` | `cron.delete` |

## Frontend Structure

The web frontend SHALL use Next.js App Router file-based routing for all views. The directory structure SHALL be:

```
web/src/app/
  layout.tsx              # Root: html, body, ThemeProvider, TooltipProvider
  (app)/                  # Route group for auth-gated app
    layout.tsx            # Auth guard, WS/AppState providers, left panel, modals
    page.tsx              # Empty state
    not-found.tsx         # 404 page
    agents/[name]/
      page.tsx            # Agent default -> redirect to default chatId
      [chatId]/page.tsx   # Agent chat view with split panes
    teams/[name]/
      page.tsx            # Team chat view
    admin/page.tsx        # Daemon status dashboard
  demo/                   # Static demo (preserved, additive changes only)
```

The `(app)` route group SHALL provide authentication gating, WebSocket connection, and app state to all nested routes without affecting URL paths. The `(app)/layout.tsx` SHALL render `LoginScreen` conditionally when the user is not authenticated, preserving the current URL for deep-link support.

### Agent chat URL
- **WHEN** user navigates to `/agents/nex/pr-review`
- **THEN** the app renders the chat view for agent "nex", chat "pr-review", with left panel visible

### Team chat URL
- **WHEN** user navigates to `/teams/research`
- **THEN** the app renders the team chat view for team "research", with left panel visible

### Team chat @ routing
- **WHEN** boss sends a message starting with `@nex` in `/teams/research`
- **THEN** the message is routed only to agent `nex` in chat scope `team:research`
- **THEN** it is not routed to other team members

- **WHEN** boss sends a message starting with `@all` in `/teams/research`
- **THEN** the message is routed to all team members in chat scope `team:research`

### Admin URL
- **WHEN** user navigates to `/admin`
- **THEN** the app renders the daemon status dashboard

### Root URL
- **WHEN** user navigates to `/`
- **THEN** the app renders the left panel with an empty state prompt ("Select a conversation")

### Demo preserved
- **WHEN** user navigates to `/demo`
- **THEN** the demo page renders with mock data, identical to its current behavior plus any additive enhancements

### Deep link while unauthenticated
- **WHEN** an unauthenticated user navigates to `/agents/nex/pr-review`
- **THEN** the login screen is shown at that URL, and after successful login the chat view renders without a redirect

### 404 route
- **WHEN** user navigates to `/nonexistent`
- **THEN** the app renders a styled "Page not found" empty state within the app layout

### Agent redirect
- **WHEN** user navigates to `/agents/nex` (no chatId)
- **THEN** the app redirects to `/agents/nex/default`

## UI Layout

The frontend SHALL use a Telegram-style layout with a persistent left panel (320px) containing a bottom tab bar. The left panel SHALL be rendered in the `(app)/layout.tsx` and persist across all route navigations. The main content area SHALL be filled by the current route's page component.

The left panel bottom tabs (Agents, Teams, Settings) SHALL control which list is shown in the left panel. Tab selection SHALL NOT change the URL or the main content area. However, when navigating via URL, the active tab SHALL auto-derive from the pathname (`/agents/*` -> Agents, `/teams/*` -> Teams, `/admin` -> Settings).

Modals (AgentCreateModal, team create) SHALL be hosted in `(app)/layout.tsx` and triggered from left panel "+" buttons.

### Tab switch preserves main content
- **WHEN** user is viewing `/agents/nex/default` and switches the bottom tab from "Agents" to "Teams"
- **THEN** the left panel shows the team list, but the main content area continues to show the nex/default chat

### Navigation from left panel
- **WHEN** user clicks an agent conversation in the left panel
- **THEN** the browser URL changes to `/agents/{name}/{chatId}` and the main content area shows the corresponding chat view

### Tab auto-switch on deep link
- **WHEN** user navigates directly to `/teams/research`
- **THEN** the left panel's active tab switches to "Teams" and highlights the research team

### Active item highlighting across tabs
- **WHEN** the URL is `/agents/nex/pr-review` and the user is on any tab
- **THEN** if the Agents tab is shown, the nex/pr-review entry is highlighted

## State Management

The `AppStateProvider` reducer SHALL NOT store URL-derived state (`view`, `selectedChat`, `selectedTeam`, `activeTab`). These values SHALL be derived from the current URL path using `useParams()` and `usePathname()` hooks via `useRouteSelection()` and `useActiveTab()`.

The `splitPane` state SHALL be local to the chat page component (not in the reducer). It is ephemeral and resets on navigation.

The reducer SHALL continue to manage: agents, agentStatuses, agentLogLines, envelopes, conversations, teams, cronSchedules, daemonStatus, drafts, relayStates, ptyOutput.

### Chat selection from URL
- **WHEN** the URL is `/agents/nex/pr-review`
- **THEN** the agent name "nex" and chat ID "pr-review" are available to components via route params, not reducer state

### Unread count reset on navigation
- **WHEN** user navigates to `/agents/nex/pr-review` which has unread messages
- **THEN** the chat page component dispatches an unread-reset action on mount, clearing the badge

### State persists across navigation
- **WHEN** user navigates from `/agents/nex/default` to `/teams/research` and back
- **THEN** previously loaded envelopes for agent:nex:default are still in the reducer

### Logout clears state and navigates
- **WHEN** user clicks "Disconnect" in the settings panel
- **THEN** auth state is cleared, WebSocket is closed, and the login screen appears at the current URL

## Demo UI as Design Reference

Real (live-data) components SHALL follow the visual structure and design patterns established by the demo components. Demo files SHALL be enhanced with missing SPA features (additive only) before being used as the reference for live components.

Demo enhancements SHALL include:
- Chat header controls (interrupt, relay, refresh, abort, agent details)
- Agent create modal and agent detail sheet
- Scheduled envelopes display above messages
- Reply preview bar above composer
- Settings panel connection status styling

Demo files SHALL be preserved with additive changes only -- no deletions or breaking modifications to existing demo code. Shared components SHALL remain backward-compatible.

### Demo unchanged baseline
- **WHEN** this change is complete
- **THEN** all existing demo functionality at `/demo` works identically, with additional new features visible

### Visual consistency
- **WHEN** the live chat view for an agent is rendered
- **THEN** its header, message list, log preview, and composer layout SHALL match the enhanced demo chat view's structure

### Demo chat header enhanced
- **WHEN** viewing an agent chat in the demo
- **THEN** the header shows interrupt toggle, relay toggle, refresh button, and agent details button alongside existing New Chat, Terminal, and Cron buttons

## Demo Composer

The demo chat and team chat composers SHALL use a real `<textarea>` element (not a static `<div>` placeholder) with:
- Auto-resize up to 160px max height
- `Enter` key sends the message (dispatches `ADD_ENVELOPE` to demo reducer)
- `Shift+Enter` inserts a newline
- Placeholder text matches the context (agent name or team name)
- Visual feedback: border color changes when text is present

Sent messages SHALL appear immediately in the message list as "boss" envelopes (`fromBoss: true`).

### User types and sends in demo chat
- **WHEN** user types text in the demo chat composer and presses Enter
- **THEN** a new envelope SHALL appear in the message list with `fromBoss: true` and the typed text

### Shift+Enter inserts newline
- **WHEN** user presses Shift+Enter in the composer
- **THEN** a newline SHALL be inserted without sending the message

### Composer auto-resizes
- **WHEN** user types multiple lines in the composer
- **THEN** the textarea SHALL grow in height up to 160px, then show a scrollbar

## Consistent Scrollbar Visibility

All scrollable containers SHALL have visible, styled scrollbars that match the application theme. This includes:
- Message lists (chat and team views)
- Left panel (chat list, agent list, team list)
- Member panels
- Terminal output areas

Firefox SHALL use `scrollbar-width: thin` and `scrollbar-color` properties. WebKit SHALL use existing `::-webkit-scrollbar` styles.

### Message list scrollbar is visible
- **WHEN** the message list overflows its container
- **THEN** a thin styled scrollbar SHALL be visible on the right side

### Left panel scrollbar is visible
- **WHEN** the chat list in the left panel overflows
- **THEN** a thin styled scrollbar SHALL be visible

## Demo Reducer ADD_ENVELOPE Action

The demo reducer SHALL support an `ADD_ENVELOPE` action that:
- Creates a new envelope with a generated ID, `fromBoss: true`, current timestamp
- Appends it to the appropriate envelope list (keyed by agent chat or team)
- Updates the conversation's `lastMessage` and `lastMessageAt`

### ADD_ENVELOPE for agent chat
- **WHEN** `ADD_ENVELOPE` is dispatched with `to: "agent:nex"`, `chatId: "pr-review"`, `text: "Hello"`
- **THEN** a new envelope SHALL be appended to `envelopes["agent:nex:pr-review"]` with `from: "channel:web:boss"`, `fromBoss: true`

### ADD_ENVELOPE for team chat
- **WHEN** `ADD_ENVELOPE` is dispatched with `to: "team:core-dev"`, `text: "Hello team"`
- **THEN** a new envelope SHALL be appended to `envelopes["team:core-dev"]` with `from: "channel:web:boss"`, `fromBoss: true`

## Demo Team Group Chat

The demo page SHALL display a fully functional team group chat view with mock messages from multiple senders, a toggleable member panel, and a demo-mode composer.

### Team chat shows mock messages
- **WHEN** user selects a team in the demo Teams tab
- **THEN** the team chat view SHALL render mock envelopes using the shared `MessageList` component, showing messages from multiple agents (e.g., nex, shieru, codex-worker) with correct sender colors and timestamps

### Member panel toggle
- **WHEN** user clicks the members toggle in the team chat header
- **THEN** a side panel SHALL appear listing all team members with their status indicators (idle/running) from `MOCK_AGENT_STATUSES`

### Demo composer with @mention hint
- **WHEN** the team chat view is displayed
- **THEN** the composer SHALL show a placeholder text mentioning @mention (e.g., "Message team... Use @name to mention") and SHALL be read-only (no actual send capability)

### Team entries in Teams tab show last message
- **WHEN** mock team envelopes exist in `MOCK_ENVELOPES`
- **THEN** team entries in the Teams tab SHALL display `lastMessage` and `lastMessageAt` computed from the most recent team envelope, and entries SHALL be sorted by recency

## Mock Team Data

### Mock team envelope data
The mock data module SHALL include team envelopes keyed by `team:<name>` containing messages from multiple senders, including an @all broadcast message and @mention messages.

### Mock team conversations
The mock data module SHALL include team entries in `MOCK_CONVERSATIONS` so teams appear in the Teams tab list.

## Frontend Runtime Notes

- API client defaults:
  - HTTP: `NEXT_PUBLIC_API_URL` or `http://localhost:3889`
  - WS: `NEXT_PUBLIC_WS_URL` or `ws://localhost:3889/ws`
- App state stack:
  - `ThemeProvider -> AuthProvider -> WebSocketProvider -> AppStateProvider`
- Frontend type definitions live in `web/src/lib/types.ts`.

## WebSocket

Event contract and payload details are canonical in:
- `openspec/specs/web-frontend/events.md`
