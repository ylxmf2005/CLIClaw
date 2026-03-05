## 1. Console Adapter Core

- [x] 1.1 Create `src/adapters/console.adapter.ts` implementing `ChatAdapter` interface. `sendMessage()` emits `console.message` WebSocket event via the daemon's WS broadcast. Address format: `channel:console:<chat-id>`.
- [x] 1.2 Register console adapter in daemon startup (`src/daemon/daemon.ts`). The console adapter is always active (no enable/disable lifecycle). Wire it into the channel bridge so it can receive and deliver messages.
- [x] 1.3 Add `"console"` to adapter type constants and any type unions/enums that enumerate adapter types in `src/adapters/types.ts`.

## 2. Router Fan-Out

- [x] 2.1 In `src/daemon/router/message-router.ts`, modify channel delivery: after resolving the primary adapter for a `channel:*` destination, look up the session via `channel_session_bindings`, then query all other bindings for the same session.
- [x] 2.2 For each co-bound adapter (excluding the primary), call `adapter.sendMessage()` as a fan-out delivery. Fan-out failures are logged but do not block primary delivery.
- [x] 2.3 Add DB helper method `getCoBindingsForSession(sessionId: string)` in `src/daemon/db/database.ts` that returns all `channel_session_bindings` rows for a given session ID.

## 3. Send-As-Adapter (Console -> Channel Address)

- [x] 3.1 In `src/daemon/rpc/envelope-send-core.ts`, allow boss-token requests to specify a custom `from` address (e.g., `from: channel:telegram:12345`). Set `metadata.origin: "console"` when the actual source is the console.
- [x] 3.2 Add validation: only boss-token holders can use arbitrary `from` addresses. Non-boss tokens are restricted to their own bound channels.

## 4. Session Management API

- [x] 4.1 Add `GET /api/agents/:name/sessions` route in `src/daemon/http/routes-sessions.ts`. Returns all sessions for an agent with their bindings (adapter type, chat ID, created time). Uses existing `channel_session_bindings` + `agent_sessions` tables.
- [x] 4.2 Add `POST /api/agents/:name/sessions` route to create a new session with an initial binding. Accepts `{ adapterType, chatId? }`. Auto-generates `chatId` if omitted.
- [x] 4.3 Add `POST /api/agents/:name/sessions/:id/bindings` route to add a binding to an existing session. Accepts `{ adapterType, chatId }`. Creates a `channel_session_bindings` row.
- [x] 4.4 Add `DELETE /api/agents/:name/sessions/:id/bindings/:adapterType/:chatId` route to remove a binding. Validates at least one binding remains.

## 5. WebSocket Event for Console Delivery

- [x] 5.1 Define `console.message` WebSocket event type in `src/daemon/ws/server.ts` and `src/daemon/events/event-bus.ts`. Payload includes the full envelope data plus the target console chat ID.
- [x] 5.2 In the console adapter's `sendMessage()`, emit `console.message` to all connected boss-token WebSocket clients via the event bus.

## 6. Web Frontend — Session-Based Chat List

- [x] 6.1 Add `api.getAgentSessions(agentName)` API client function in `web/src/lib/api.ts` that calls `GET /api/agents/:name/sessions`.
- [x] 6.2 Add session types to `web/src/lib/types.ts`: `AgentSession { id, agentName, createdAt, lastActivityAt, bindings: SessionBinding[] }`, `SessionBinding { adapterType, chatId, createdAt }`.
- [x] 6.3 Update `AppStateProvider` to load and store sessions per agent. Add `sessions: Record<string, AgentSession[]>` to state, `SET_SESSIONS` action, and `loadSessions(agentName)` callback.
- [x] 6.4 Update the left panel chat list to display sessions grouped by agent, showing adapter type badges (Telegram icon, console icon) and last message preview.
- [x] 6.5 Handle `console.message` WebSocket event in the WS provider — dispatch `ADD_ENVELOPE` to update the chat view in real-time.

## 7. Web Frontend — Chat View Adapter Integration

- [x] 7.1 Update agent chat page to determine the session's primary adapter and use the correct `from` address when sending. For console sessions, use `channel:console:<chatId>`. For Telegram sessions viewed on console, use `channel:telegram:<chatId>` with `origin: "console"`.
- [x] 7.2 Add adapter badge/indicator to the chat header showing which adapter(s) the session is bound to.
- [x] 7.3 Update the "New chat" button to call `POST /api/agents/:name/sessions { adapterType: "console" }` and navigate to the new session's chat view.

## 8. Web Frontend — Session Binding Management

- [x] 8.1 Add `api.addSessionBinding()` and `api.removeSessionBinding()` API client functions.
- [x] 8.2 Create a session bindings panel/dialog accessible from the chat header. Shows all bindings for the current session with adapter type and chat ID.
- [x] 8.3 Add "Link adapter" action in the bindings panel — allows selecting an adapter type and entering a chat ID to bind to the current session.
- [x] 8.4 Add "Unlink" action per binding — removes the binding (with confirmation if it's the last binding).

## 9. Web Frontend — Slash Command & Relay Fixes

- [x] 9.1 Verify slash commands (`/abort`, `/refresh`, `/interrupt`) work end-to-end: composer detects slash, calls handler, handler calls correct API, agent responds. Fix any server-side RPC handler issues with admin-token acceptance.
- [x] 9.2 Wire relay PTY end-to-end: relay toggle in chat header -> `POST /api/agents/:name/chats/:chatId/relay` -> broker manager spawns PTY -> `agent.pty.output` WS events -> xterm.js. Boss keystrokes via `agent.pty.input` -> broker `sendInput()`.
- [x] 9.3 Terminal mode indicator: "Terminal (read-only)" when relay off, "Terminal (interactive)" when relay on. Disable relay toggle with tooltip when broker unavailable (`daemonStatus.relayAvailable`).

## 10. Web Frontend — Remaining Features

- [x] 10.1 Add `@` mention rendering in `MessageContent`: derive `@recipient` or `@this-agent` from envelope `to`/`from` fields. Render as highlighted prefix.
- [x] 10.2 Add envelope origin indicator: small icon/badge for `cli`/`channel`/`cron`/`internal` origin on each message bubble.
- [x] 10.3 Wire file upload: use `uploadFile()` API to get server path, pass as attachment in `sendEnvelope()`. Connect drag-and-drop/paste handlers in composer.
- [x] 10.4 Handle `envelope.done` WS event: update envelope status in state (pending -> done). Show failed envelopes with error indicator.
