## 1. Console Adapter Core

- [ ] 1.1 Create `src/adapters/console.adapter.ts` implementing `ChatAdapter` interface. `sendMessage()` emits `console.message` WebSocket event via the daemon's WS broadcast. Address format: `channel:console:<chat-id>`.
- [ ] 1.2 Register console adapter in daemon startup (`src/daemon/daemon.ts`). The console adapter is always active (no enable/disable lifecycle). Wire it into the channel bridge so it can receive and deliver messages.
- [ ] 1.3 Add `"console"` to adapter type constants and any type unions/enums that enumerate adapter types.

## 2. Router Fan-Out

- [ ] 2.1 In `src/daemon/router/message-router.ts`, modify channel delivery: after resolving the primary adapter for a `channel:*` destination, look up the session via `channel_session_bindings`, then query all other bindings for the same session.
- [ ] 2.2 For each co-bound adapter (excluding the primary), call `adapter.sendMessage()` as a fan-out delivery. Fan-out failures are logged but do not block primary delivery.
- [ ] 2.3 Add DB helper method `getCoBindingsForSession(sessionId: string)` in `src/daemon/db/database.ts` that returns all `channel_session_bindings` rows for a given session ID.

## 3. Send-As-Adapter (Console → Channel Address)

- [ ] 3.1 In `src/daemon/rpc/envelope-send-core.ts`, allow boss-token requests to specify a custom `from` address (e.g., `from: channel:telegram:12345`). Set `metadata.origin: "console"` when the actual source is the console.
- [ ] 3.2 Add validation: only boss-token holders can use arbitrary `from` addresses. Non-boss tokens are restricted to their own bound channels.

## 4. Session Management API

- [ ] 4.1 Add `GET /api/agents/:name/sessions` route in `src/daemon/http/`. Returns all sessions for an agent with their bindings (adapter type, chat ID, created time). Uses existing `channel_session_bindings` + `agent_sessions` tables.
- [ ] 4.2 Add `POST /api/agents/:name/sessions` route to create a new session with an initial binding. Accepts `{ adapterType, chatId? }`. Auto-generates `chatId` if omitted.
- [ ] 4.3 Add `POST /api/agents/:name/sessions/:id/bindings` route to add a binding to an existing session. Accepts `{ adapterType, chatId }`. Creates a `channel_session_bindings` row.
- [ ] 4.4 Add `DELETE /api/agents/:name/sessions/:id/bindings/:adapterType/:chatId` route to remove a binding. Validates at least one binding remains.
- [ ] 4.5 Add corresponding RPC handlers if needed for CLI access to session management.

## 5. WebSocket Event for Console Delivery

- [ ] 5.1 Define `console.message` WebSocket event type in `openspec/specs/web-frontend/events.md` and `src/daemon/http/ws.ts`. Payload includes the full envelope data plus the target console chat ID.
- [ ] 5.2 In the console adapter's `sendMessage()`, emit `console.message` to all connected boss-token WebSocket clients.

## 6. Web Frontend — Session-Based Chat List

- [ ] 6.1 Add `api.getAgentSessions(agentName)` API client function in `web/src/lib/api.ts` that calls `GET /api/agents/:name/sessions`.
- [ ] 6.2 Add session types to `web/src/lib/types.ts`: `AgentSession { id, agentName, createdAt, lastActivityAt, bindings: SessionBinding[] }`, `SessionBinding { adapterType, chatId, createdAt }`.
- [ ] 6.3 Update `AppStateProvider` to load and store sessions per agent. Add `sessions: Record<string, AgentSession[]>` to state, `SET_SESSIONS` action, and `loadSessions(agentName)` callback.
- [ ] 6.4 Update the left panel chat list (Chats tab) to display sessions grouped by agent, showing adapter type badges (Telegram icon, console icon) and last message preview.
- [ ] 6.5 Handle `console.message` WebSocket event in the WS provider — dispatch `ADD_ENVELOPE` to update the chat view in real-time.

## 7. Web Frontend — Chat View Adapter Integration

- [ ] 7.1 Update agent chat page to determine the session's primary adapter and use the correct `from` address when sending. For console sessions, use `channel:console:<chatId>`. For Telegram sessions viewed on console, use `channel:telegram:<chatId>` with `origin: "console"`.
- [ ] 7.2 Add adapter badge/indicator to the chat header showing which adapter(s) the session is bound to.
- [ ] 7.3 Update the "New chat" button to call `POST /api/agents/:name/sessions { adapterType: "console" }` and navigate to the new session's chat view.

## 8. Web Frontend — Session Binding Management

- [ ] 8.1 Add `api.addSessionBinding()` and `api.removeSessionBinding()` API client functions.
- [ ] 8.2 Create a session bindings panel/dialog accessible from the chat header. Shows all bindings for the current session with adapter type and chat ID.
- [ ] 8.3 Add "Link adapter" action in the bindings panel — allows selecting an adapter type and entering a chat ID to bind to the current session.
- [ ] 8.4 Add "Unlink" action per binding — removes the binding (with confirmation if it's the primary adapter).
