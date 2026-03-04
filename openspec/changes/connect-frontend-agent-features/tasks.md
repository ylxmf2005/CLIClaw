## Testing Policy

Every task group includes inline testing requirements:
- **Unit tests**: Written alongside implementation for backend modules and frontend logic
- **Browser E2E tests**: After each frontend-facing step, use browser skill (chrome-devtools) to verify UI behavior against the running app
- **Pattern**: implement → unit test → build → browser verify (where applicable)

---

## 1. Backend — Align Web Chat Queries with Existing `chatScope` Model

> **CRITICAL**: Backend already stores per-chat identity in `metadata.chatScope`, but frontend currently ignores it and queries by `to=agent:<name>:<chatId>`.

- [ ] 1.1 Keep canonical model for agent chats: `to` remains `agent:<name>` and `metadata.chatScope` carries `chatId`; document this in HTTP handler comments/tests to prevent regressions
- [ ] 1.2 Add/extend envelope list filtering to support optional `chatId` (mapped to `metadata.chatScope`) for web queries; avoid `to`-prefix SQL hacks
- [ ] 1.3 Add `GET /api/agents/:name/conversations` — query distinct chatIds from `metadata.chatScope` for envelopes involving that agent; return `[{ chatId, lastMessageAt, lastMessage, messageCount }]`
- [ ] 1.4 Verify web send path still accepts `agent:<name>:new|<chatId>` and correctly persists `metadata.chatScope` while keeping normalized `to=agent:<name>`
- [ ] 1.T Unit tests: `agent:<name>:new|<chatId>` send stamps expected `chatScope`; envelope list `chatId` filter returns correct slice; conversations query returns distinct chatIds sorted by recency

## 2. Backend — Allow Admin Token for Envelope Operations

> **CRITICAL**: Frontend authenticates with admin token, but `envelope.send` and `envelope.list` hard-reject admin tokens.

- [ ] 2.1 Modify `envelope.send` RPC handler: allow admin principal to send envelopes with `fromBoss: true` — admin-sent envelopes are boss messages
- [ ] 2.2 Modify `envelope.list` RPC handler: allow admin principal to list any agent's envelopes (admin has full visibility)
- [ ] 2.3 Modify `envelope.thread` RPC handler: allow admin principal to view any thread
- [ ] 2.T Unit tests: test envelope.send with admin token succeeds and sets `fromBoss: true`; test envelope.list with admin token returns envelopes; test with invalid token still fails

## 3. Backend — Add Missing RPC Methods and DB Fields

- [ ] 3.1 Add `session.list` RPC handler — wire existing `db.listAgentSessionsByAgent()` to RPC; return `{ sessions: AgentSession[] }`
- [ ] 3.2 Add `relayMode` column to agents table (`TEXT DEFAULT 'default-off'`); add to `AgentRow` interface; expose in `agent.status` and `agent.set` RPCs
- [ ] 3.3 Add `chat.relay-toggle` RPC — accepts `{ agentName, chatId, relayOn: boolean }`, stores per-chat relay state (new `chat_state` table or in-memory map)
- [ ] 3.4 Create `chat_state` table: `agent_name TEXT, chat_id TEXT, relay_on BOOLEAN DEFAULT 0, PRIMARY KEY (agent_name, chat_id)` — tracks per-chat relay mode
- [ ] 3.5 Add file upload endpoint: `POST /api/upload` — accepts multipart form data, saves to `~/hiboss/media/<uuid>-<filename>`, returns `{ path: string }` for use in `envelope.send` attachments
- [ ] 3.T Unit tests: test session.list returns sessions; test relayMode CRUD on agent; test chat.relay-toggle persists; test file upload saves and returns path

## 4. Daemon Event Bus

- [ ] 4.1 Create `src/daemon/events/event-bus.ts` — typed `DaemonEventBus` (Node EventEmitter) with typed event names and payload interfaces matching WsEventType
- [ ] 4.2 Wire event emission into existing daemon code: envelope creation (`envelope.new`), envelope done (`envelope.done`), agent state changes (`agent.status`), agent register (`agent.registered`), agent delete (`agent.deleted`), run start/complete (`run.started`/`run.completed`)
- [ ] 4.3 Wire agent log capture — hook into `child.stdout.on("data")` and `child.stderr.on("data")` in `src/agent/executor-turn.ts` to emit `agent.log` events with `{ name, chatId, line }` per line
- [ ] 4.T Unit tests: verify typed event emission/subscription, verify each wired emission point fires correctly with expected payload shape

## 5. Daemon HTTP Server

- [ ] 5.1 Create `src/daemon/http/server.ts` — Node `http` module server with configurable port (`HIBOSS_HTTP_PORT`, default 3889), CORS support, JSON body parsing, Bearer token auth middleware
- [ ] 5.2 Create `src/daemon/http/router.ts` — path-based router mapping REST endpoints to handler functions
- [ ] 5.3 Implement auth endpoints: `POST /api/auth/login` (wraps `admin.verify`), `GET /api/setup/check` (wraps `setup.check`, no token required)
- [ ] 5.4 Implement daemon endpoints: `GET /api/daemon/status`, `GET /api/daemon/time`
- [ ] 5.5 Implement agent endpoints: `GET /api/agents`, `POST /api/agents`, `GET /api/agents/:name`, `PATCH /api/agents/:name`, `DELETE /api/agents/:name`, `POST /api/agents/:name/abort`, `POST /api/agents/:name/refresh`
- [ ] 5.6 Implement agent conversation endpoint: `GET /api/agents/:name/conversations` — returns list of chatIds with metadata
- [ ] 5.7 Implement envelope endpoints: `POST /api/envelopes`, `GET /api/envelopes` (with `to`, `from`, `status`, `limit`, `chatId` params; `chatId` filters by `metadata.chatScope`), `GET /api/envelopes/:id/thread`
- [ ] 5.8 Implement session endpoint: `GET /api/sessions?agentName=<name>`
- [ ] 5.9 Implement file upload: `POST /api/upload` — multipart form → save to media dir → return path
- [ ] 5.10 Implement relay endpoints: `POST /api/agents/:name/chats/:chatId/relay` (toggle relay), `GET /api/agents/:name/chats/:chatId/relay` (get state)
- [ ] 5.11 Integrate HTTP server startup into `src/daemon/daemon.ts`
- [ ] 5.T Unit tests: test router path matching; test auth middleware; test each endpoint returns correct response shape; integration test: start HTTP server → call each endpoint → verify responses

## 6. Daemon WebSocket Server

- [ ] 6.1 Add `ws` package dependency
- [ ] 6.2 Create `src/daemon/ws/server.ts` — WebSocket server on same HTTP server (upgrade path), token auth on connect, client connection management
- [ ] 6.3 Implement snapshot event on connect — send current agents list, per-agent statuses, daemon status
- [ ] 6.4 Subscribe WS server to `DaemonEventBus` — broadcast all events to connected clients as typed JSON
- [ ] 6.5 Add `agent.pty.output` and `agent.pty.input` WS message types for relay mode PTY I/O
- [ ] 6.6 Implement agent log line batching/debounce (max 10 lines per frame, 100ms debounce) for pipe mode
- [ ] 6.T Unit tests: test auth on connect; test snapshot delivery; test event broadcast; test log batching timing

## 7. Agent-Relay Integration (Daemon)

- [ ] 7.1 Add `@agent-relay/sdk` dependency
- [ ] 7.2 Create `src/daemon/relay/broker-manager.ts` — start `agent-relay-broker init` on daemon start; graceful shutdown; detect if binary available (graceful degradation)
- [ ] 7.3 Create `src/agent/executor-relay.ts` — relay executor path: `RelayAdapter.spawn()` for PTY sessions, `RelayAdapter.sendInput()` for envelope injection, subscribe to `worker_stream` for PTY output
- [ ] 7.4 Wire relay `worker_stream` events → `DaemonEventBus` as `agent.pty.output`
- [ ] 7.5 Wire WS `agent.pty.input` → `RelayAdapter.sendInput()` for interactive terminal
- [ ] 7.6 Implement mode switch with session resume (`continueFrom`); fallback to fresh session
- [ ] 7.T Unit tests: broker-manager lifecycle; relay mode tracking; mode switch logic

## 8. Frontend — Update Types and API Client

> Must update frontend types and API client to match the backend changes above.

- [ ] 8.1 Update `web/src/lib/types.ts`: add `relayMode` to `Agent`; add `ChatConversation` fields; add `agent.pty.output` / `agent.pty.input` to `WsEventType`; add `relayAvailable` to `DaemonStatus`; add `origin: "cli" | "channel" | "cron" | "internal"` to `Envelope`; expand `Envelope.status` to include `"queued" | "failed" | "expired"`; ensure `lastRun` and `currentRun` fields are fully typed with `error`, `contextLength`, `startedAt`
- [ ] 8.2 Update `web/src/lib/api.ts`: add `getConversations(agentName)` → `GET /api/agents/:name/conversations`; add `toggleRelay(agentName, chatId, on)` → `POST /api/agents/:name/chats/:chatId/relay`; add `getRelayState(agentName, chatId)` → `GET /api/agents/:name/chats/:chatId/relay`; add `uploadFile(file)` → `POST /api/upload`; update `listEnvelopes()` to support `chatId` param
- [ ] 8.3 Update `web/src/providers/app-state-provider.tsx`: add `conversations: Record<string, ChatConversation[]>` to state; add `relayStates: Record<string, boolean>` per chat; add reducer actions for conversations, relay state, unread counts, `agent.pty.output`; update `loadEnvelopes()` to use `chatId` filter against `metadata.chatScope` (not `to=agent:<name>:<chatId>`)

## 9. Frontend — Wire Auth and Providers

- [ ] 9.1 Verify `AuthProvider` works against daemon HTTP server
- [ ] 9.2 Verify `WebSocketProvider` connects to daemon WS
- [ ] 9.3 Verify `AppStateProvider` initial data load works
- [ ] 9.4 Verify WS event handlers dispatch correctly
- [ ] 9.5 Add error handling for API-unreachable state — retry option
- [ ] 9.6 Wire `useToast()` throughout the app
- [ ] 9.7 Show `lastRun.error` on agent error state — when agent has red dot (health=error), show error message in agent card subtitle and in chat header; currently boss sees red dot with no explanation
- [ ] 9.8 Show "running for Xm" on agent card — when `currentRun.startedAt` exists, display elapsed time counter in agent card and chat header
- [ ] 9.E **Browser E2E**: start daemon + web → login → verify agents load → verify WS "Connected"; invalid token → error; daemon down → retry button

## 10. Frontend — Agent List and Management

- [ ] 10.1 Verify `AgentList` displays real agents
- [ ] 10.2 Verify `AgentCreateModal` works; add session policy fields (dailyResetAt, idleTimeout, maxContextLength); add adapter binding fields (adapterType, botToken) so binding can happen at creation time
- [ ] 10.3 Create `AgentDetailSheet` — full agent details including: `relayMode` default, session policy, `lastRun` details (status, error, contextLength, startedAt, completedAt), `currentRun` (startedAt → show "running for Xm"), `lastSeenAt`
- [ ] 10.4 Agent edit form — including `relayMode`, session policy fields; submit via `PATCH /api/agents/:name`; toast feedback
- [ ] 10.5 Agent delete flow — `ConfirmDialog` → `DELETE /api/agents/:name`
- [ ] 10.6 Binding management — show/add/remove bindings
- [ ] 10.7 Trigger to open `AgentDetailSheet` from `AgentCard` and `ChatView` header
- [ ] 10.8 Add permission level descriptions — tooltip/help text on each dropdown option in create modal and detail sheet
- [ ] 10.E **Browser E2E**: create modal with session policy + binding fields → submit → token; detail sheet shows lastRun error/status/contextLength, currentRun "running for Xm"; edit → save; delete → confirm; permission tooltips visible

## 11. Frontend — Multi-Chat and Conversations

- [ ] 11.1 Upgrade `ChatListPanel` to multi-chat — call `getConversations(agentName)` on expand; show per-agent sub-list
- [ ] 11.2 "New Chat" action — `generateChatId()`, select empty conversation
- [ ] 11.3 Load conversation history — `listEnvelopes({ to: "agent:<name>", chatId: "<chatId>" })`
- [ ] 11.4 Wire `resolveDefaultChatId()` — select most recent on agent click
- [ ] 11.E **Browser E2E**: expand agent → see conversations; new chat → empty view; switch conversations → correct messages load

## 12. Frontend — `@` Mention Rendering and Visibility

- [ ] 12.1 Implement auto `@` rendering — derive `@recipient` / `@this-agent` from envelope `to`/`from` fields; render as highlighted prefix
- [ ] 12.2 Route `envelope.new` WS events to both sender's and receiver's conversation views
- [ ] 12.3 Wire unread count — increment on `envelope.new` for non-selected conversation; reset on selection
- [ ] 12.4 Wire `@mention` highlighting in `MessageContent` — pass `mentions` prop for team messages
- [ ] 12.5 Update chat list preview on `envelope.new`
- [ ] 12.T Unit tests: `@` derivation logic; envelope routing to conversation keys; unread count increment/reset
- [ ] 12.E **Browser E2E**: send from agent A to B via CLI → verify `@B` in A's chat, message in B's chat; unread badge on non-selected chat

## 13. Frontend — Chat View Wiring

- [ ] 13.1 Verify `MessageComposer` sends (already calls `sendEnvelope()`)
- [ ] 13.2 Wire file attachment upload — use `uploadFile()` to get server path, then pass as `attachments` in `sendEnvelope()`
- [ ] 13.3 Verify `MessageList` displays real envelopes
- [ ] 13.4 Verify abort/refresh; add toast
- [ ] 13.5 Verify schedule send
- [ ] 13.6 Toast feedback for send errors
- [ ] 13.7 Add `interruptNow` toggle to composer — button or keyboard shortcut to send urgent/interrupt messages (sets `priority=1`)
- [ ] 13.8 Show envelope origin indicator in messages — small icon/badge for `cli`/`channel`/`cron`/`internal` origin so boss can see where a message came from (Telegram icon, CLI icon, clock icon for cron)
- [ ] 13.9 Fetch and show pending/scheduled envelopes — currently `loadEnvelopes` hardcodes `status: "done"`, so scheduled messages are invisible; add a "Scheduled" section or pending indicator showing queued messages with their `deliverAt` time and option to cancel
- [ ] 13.10 Handle `envelope.done` WS event — add reducer case; update envelope status in state (e.g., transition from pending → done)
- [ ] 13.11 Show failed envelopes — fetch envelopes with `status: "failed"`, display with error indicator and retry option
- [ ] 13.12 Add reply affordance — "Reply" action on messages that sets `replyToEnvelopeId`; show quoted parent in composer; render reply chain in message list (quote of replied message above the reply)
- [ ] 13.13 Implement thread split pane — wire the existing `splitPane: "thread"` value to render a thread view; add `case "thread"` in `app-shell.tsx` `renderSplitPane()`; load thread via `getThread(envelopeId)`
- [ ] 13.14 Use boss timezone for all timestamp display — apply `setupCheck.userInfo.bossTimezone` or `daemonTime.bossTimezone` to `formatTime()`, `formatMessageTime()`, and `SchedulePopover` preview; fall back to browser TZ if not configured
- [ ] 13.E **Browser E2E**: send message → appears; interrupt toggle → urgent message sent; abort → status changes; refresh → toast; file upload → send; schedule send → message shows in "Scheduled" with time → fires later → moves to done; reply to message → quote shown → thread view opens; verify timestamps match boss timezone; failed envelope shows error + retry

## 14. Frontend — Terminal View and Relay Toggle

- [ ] 14.1 Relay toggle in chat header — toggle button; disabled with tooltip when broker unavailable (check `daemonStatus.relayAvailable`)
- [ ] 14.2 Upgrade `TerminalView` dual mode — relay off: read-only + `agent.log`; relay on: interactive + `agent.pty.output` / `agent.pty.input`
- [ ] 14.3 Terminal mode indicator — "Terminal (read-only)" / "Terminal (interactive)"
- [ ] 14.4 Resizable split pane — drag handle; min 280px, max 60%; xterm.js refit
- [ ] 14.5 Terminal clears on agent/chat switch
- [ ] 14.6 Wire `agent.pty.input` — xterm.js `onData` → WS send
- [ ] 14.E **Browser E2E**: open terminal → "read-only" label; toggle relay → "interactive"; type → agent responds; resize drag → terminal refits; switch agent → clears; broker unavailable → toggle disabled

## 15. Frontend — Wire Unused Shared Components

- [ ] 15.1 Replace inline empty states with `EmptyState` component
- [ ] 15.2 Replace inline avatar divs with shared `Avatar` component
- [ ] 15.3 Use `Skeleton` loading during API fetches
- [ ] 15.E **Browser E2E**: throttle network → skeleton shows; no agents → empty state; avatars render with gradients

## 16. Full Integration Testing

- [ ] 16.1 **Browser E2E**: daemon start → web UI login → agents visible → send message → response → logs in terminal
- [ ] 16.2 **Browser E2E**: agent CRUD: create → list → detail → edit → delete
- [ ] 16.3 **Browser E2E**: multi-chat: new chat → switch → correct messages
- [ ] 16.4 **Browser E2E**: real-time: register/delete agent via CLI → UI updates without refresh
- [ ] 16.5 **Browser E2E**: `@` visibility: A sends to B → boss sees in both chats
- [ ] 16.6 **Browser E2E**: relay: toggle on → interactive terminal → type → responds → toggle off → read-only
- [ ] 16.7 **Browser E2E**: session resume: toggle relay on/off → context preserved
- [ ] 16.8 **Browser E2E**: file upload: attach file → send → verify delivered with attachment
- [ ] 16.9 **Browser E2E**: error visibility: trigger agent error → verify red dot + error message shown in card subtitle and detail sheet
- [ ] 16.10 **Browser E2E**: scheduled messages: schedule send → see in "Scheduled" section → verify fires at correct time → transitions to done
- [ ] 16.11 **Browser E2E**: threading: reply to message → quoted reply visible → open thread view in split pane
- [ ] 16.12 **Browser E2E**: origin indicators: send from CLI → message shows CLI icon; send from Telegram → shows Telegram icon; cron fires → shows clock icon
- [ ] 16.13 **Browser E2E**: interrupt: send with interrupt toggle → verify agent receives as priority message
