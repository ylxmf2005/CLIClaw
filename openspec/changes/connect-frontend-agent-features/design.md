## Context

The Hi-Boss daemon currently exposes only a Unix Domain Socket JSON-RPC 2.0 server for CLI communication. The web frontend (`web/`) has a complete UI shell with Telegram-style layout, all component scaffolding, and a self-contained demo page — but zero live data. The REST API client (`web/src/lib/api.ts`) is already written targeting `http://localhost:3889`, with all endpoints defined. The missing piece is the daemon-side HTTP+WS server and the frontend wiring to use real data instead of mock state.

The current executor runs provider CLIs in non-interactive `-p` pipe mode (`echo "input" | claude -p --output-format stream-json`). This prevents interactive terminal usage. By integrating `@agent-relay/sdk`, we can offer an optional PTY-based interactive mode per chat.

Scope is limited to agent-related features: agent CRUD, agent chat, agent status/logs, terminal, relay integration. Teams and settings are deferred.

## Goals / Non-Goals

**Goals:**
- Daemon serves HTTP REST API on port 3889, translating requests to existing internal RPC methods
- Daemon serves WebSocket on the same port for real-time event push
- Frontend agent list, chat, terminal, and create modal work against real daemon
- Agent detail view with edit/delete capabilities
- Multi-chat per agent in production (matching demo behavior)
- `@` mention rendering for cross-destination message visibility
- Optional interactive PTY terminal via `@agent-relay/sdk` (per-chat toggle)
- Resizable split pane for terminal

**Non-Goals:**
- Team management UI or team chat wiring (deferred)
- Settings panel beyond daemon status (deferred)
- Cron panel wiring (deferred, though infrastructure will support it)
- Mobile responsiveness
- Production deployment / static file serving from daemon
- Authentication beyond admin token (no user accounts)

## Decisions

### 1. HTTP server: Node native `http` module + minimal router

**Decision**: Use Node's built-in `http` module with a thin hand-rolled router, not Express.

**Rationale**: Hi-Boss has zero HTTP dependencies today. Adding Express pulls in 30+ transitive deps for what is essentially a thin RPC-to-REST translation layer. The API surface is ~25 endpoints with uniform patterns (parse path, validate token, call RPC method, return JSON). A simple `Map<string, handler>` router suffices.

### 2. WebSocket: `ws` package

**Decision**: Use the `ws` npm package, attached to the same HTTP server.

**Rationale**: `ws` is the de facto Node WebSocket library, lightweight (~200 LOC core), no framework dependency. It can share the HTTP server's upgrade path.

### 3. Event emission: Internal EventEmitter hub

**Decision**: Add a central `DaemonEventBus` (Node `EventEmitter`) in the daemon. Existing code emits typed events. The WS server subscribes and broadcasts to connected clients.

**Rationale**: Decouples event production from WS transport. The existing daemon code already has clear points where events happen.

### 4. Auth on HTTP/WS: Bearer token, same as IPC

**Decision**: `Authorization: Bearer <admin-token>` for REST. Token as query param on WS connect (`ws://host/ws?token=...`). Same validation as IPC.

### 5. Frontend state: Keep `AppStateProvider` reducer, wire to real APIs

**Decision**: Keep the existing `useReducer`-based `AppStateProvider`. The provider structure is already correct — `AuthProvider → WebSocketProvider → AppStateProvider`. Only data fetching implementations need to change.

### 6. Agent detail view: Sheet/drawer from agent card

**Decision**: Agent detail is a slide-out sheet (shadcn `Sheet`) triggered from the agent card or chat header. Contains: agent info, edit form, delete button, binding management, relay default setting.

### 7. Multi-chat: Upgrade production ChatListPanel to match demo

**Decision**: Port the demo's expandable per-agent chat list to production. Each agent shows its conversations (from envelope `chatScope` metadata).

### 8. Message `@` rendering for cross-destination visibility

**Decision**: Auto-render `@recipient` or `@sender` based on envelope `to`/`from` fields. The `@` is NOT typed by the agent — it's derived by the UI from envelope addressing.

**Rules:**
- Outbound (agent sends to someone else): message bubble shows `@recipient` prefix (e.g., `nex: @shieru Can you check this?`)
- Inbound (another agent sends to this agent): message bubble shows `@this-agent` (e.g., `shieru: @nex Here's the report`)
- Channel destinations: `@channel-name` (e.g., `nex: @telegram:12345 PR review done`)
- Team destinations: `@team-name` (e.g., `nex: @core-dev Status update`)
- Messages appear in both sender's and receiver's conversations

**Rationale**: This gives the boss full visibility into all agent-to-agent, agent-to-team, and agent-to-channel communication without needing a separate activity feed. The `@` pattern is immediately recognizable from Telegram/Slack conventions.

### 9. Agent-relay integration: Optional PTY mode via `@agent-relay/sdk`

**Decision**: Add `@agent-relay/sdk` as a dependency. Use `RelayAdapter` to spawn agents in PTY mode when relay is enabled.

**Architecture:**
```
Agent Config:    relayMode: "default-on" | "default-off"
Per Chat:        relay toggle in chat header (overrides agent default)

When relay OFF (current behavior):
  executor-turn.ts → spawn claude -p → pipe stdin → stream-json stdout → exit
  Terminal: read-only log viewer

When relay ON:
  RelayAdapter.spawn() → broker → pty worker → long-running claude process
  Terminal: interactive (xterm.js bidirectional)
  PTY output → RelayAdapter.onEvent("worker_stream") → DaemonEventBus → WS → xterm.js
  Boss keystrokes → WS → daemon → RelayAdapter.sendInput() → PTY stdin
```

**Broker lifecycle**: `hiboss daemon start` starts `agent-relay-broker init` as a managed subprocess. All relay-on chats share this broker instance. Broker stops when daemon stops.

**Mode switch**: When toggling relay on/off mid-chat, the session context is preserved via relay's `continueFrom` (session resume) capability.

**Alternative considered**: Build own PTY layer with `node-pty` — rejected because `@agent-relay/sdk` already solves PTY management, idle detection, auto-enter for stuck agents, echo verification, and MCP approval handling. Would be ~1000+ LOC to replicate.

### 10. Terminal WS protocol: Hi-Boss as relay proxy

**Decision**: All PTY data flows through Hi-Boss's single WS connection. New WS message types:
- `agent.pty.output` (server → client): raw PTY chunks from relay broker
- `agent.pty.input` (client → server): keystrokes from browser terminal

**Rationale**: Frontend only needs one WS connection (Hi-Boss). All Hi-Boss commands (abort, refresh, envelope, cron) go through the same channel. The relay broker is transparent to the frontend. Localhost relay adds < 1ms latency.

### 11. Terminal layout: Right split pane with resizable width

**Decision**: Keep terminal in right split pane (shared with cron panel). Add drag handle to resize width (default 420px, min 280px, max 60% viewport). Terminal mode label shows "Terminal (read-only)" or "Terminal (interactive)" based on relay state.

### 12. Envelope chat model: keep `metadata.chatScope`, frontend consumes it

**Decision**: Keep the existing backend envelope model. Agent chat identity remains in `metadata.chatScope`, while `to` stays canonicalized as `agent:<name>`.

**Problem found**: The frontend currently treats `agent:<name>:<chatId>` as both send address and list key, but the backend canonical model stores chat scope in metadata. This causes empty query results when the frontend filters by `to=agent:<name>:<chatId>`.

**Fix**: Keep send behavior as-is (`POST /api/envelopes` still accepts `agent:<name>:new|<chatId>` and stamps `metadata.chatScope`). Update HTTP envelope list support to allow `chatId` filtering against `metadata.chatScope`, and update frontend conversation grouping/loading to use `chatScope` instead of assuming `to` includes chatId.

### 13. Admin token access to envelope operations

**Decision**: Allow admin tokens to call `envelope.send`, `envelope.list`, and `envelope.thread`. Admin-sent envelopes get `fromBoss: true`. This is a policy change in the RPC handlers, not a new auth mechanism.

**Problem found**: Both `envelope.send` and `envelope.list` explicitly reject admin tokens with `rpcError(UNAUTHORIZED)`. The frontend authenticates exclusively with admin tokens. This completely blocks the frontend from reading or sending messages.

**Fix**: Modify the auth check in envelope RPC handlers to accept admin principal. Admin-sent envelopes are automatically marked `fromBoss: true`.

### 14. Conversations list endpoint

**Decision**: Add `GET /api/agents/:name/conversations` endpoint that queries distinct chatIds from `metadata.chatScope` for envelopes involving the target agent. Returns `[{ chatId, lastMessageAt, lastMessage, messageCount }]`.

**Problem found**: No way to get the list of conversations for an agent. The frontend needs this to build the expandable chat list.

### 15. Per-chat state tracking

**Decision**: Add `chat_state` table (`agent_name, chat_id, relay_on, PRIMARY KEY(agent_name, chat_id)`) for per-chat relay mode. Other per-chat state (unread counts) is tracked client-side since it's session-specific.

### 16. File upload endpoint

**Decision**: Add `POST /api/upload` accepting multipart form data. Save to `~/hiboss/media/<uuid>-<filename>`. Return `{ path }` for use in `envelope.send` attachments. Max 10MB (matching frontend limit).

### 17. Frontend type and API updates

**Decision**: Frontend `types.ts` and `api.ts` need updates to match backend changes: `relayMode` on Agent, `relayAvailable` on DaemonStatus, new API methods (`getConversations`, `toggleRelay`, `uploadFile`), new WS event types (`agent.pty.output`, `agent.pty.input`), `chatId` param on `listEnvelopes`.

## Risks / Trade-offs

- **[Port conflict]** Port 3889 may be in use → Mitigation: Make port configurable via env var `HIBOSS_HTTP_PORT`, default 3889.
- **[CORS]** → Add CORS headers only in dev mode (when frontend runs on `:3000`).
- **[Admin token policy change]** Allowing admin tokens for envelope ops changes security boundary → Mitigation: Admin tokens already have full RPC access for agent/team/cron; envelopes are the only exception. Aligning this is consistent. Admin-sent envelopes are explicitly marked `fromBoss: true`.
- **[Chat scope mismatch]** Legacy/frontend code that keys conversations by `to` may miss messages because chat identity lives in `metadata.chatScope` → Mitigation: standardize list/query/filter behavior on `chatScope`, and keep a compatibility fallback for envelopes missing `chatScope`.
- **[Log streaming volume]** → Buffer and batch log lines server-side (max 10 lines per WS frame, 100ms debounce).
- **[Relay broker dependency]** `agent-relay-broker` binary must be installed → Mitigation: Graceful degradation — if binary not found, relay mode is disabled but pipe mode still works. Show clear error in UI.
- **[PTY mode + `-p` mode coexistence]** Two executor paths adds complexity → Mitigation: Clean separation — `executor-turn.ts` handles pipe mode, new `executor-relay.ts` handles PTY mode. Mode selected per-chat before execution starts.
- **[Session resume on mode switch]** Relay's `continueFrom` may not always work cleanly → Mitigation: If resume fails, start fresh session with a toast notification.
