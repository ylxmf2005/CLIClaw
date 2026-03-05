## Context

Hi-Boss daemon already has HTTP REST server (port 3889), WebSocket server, event bus, and relay broker manager implemented. The web frontend has working auth, agent list, chat view, and terminal. The Telegram adapter is the only external adapter.

Missing pieces:
1. No console adapter — the web cannot act as a channel adapter.
2. No router fan-out — agent replies go only to the addressed adapter, not co-bound adapters.
3. No session management API — cannot list/create sessions or manage adapter bindings from the web.
4. Slash commands fire client-side but have server-side handling issues.
5. Relay PTY flow is partially wired (toggle exists, broker manager exists) but not end-to-end.
6. Frontend missing: `@` mention rendering, origin indicators, file upload, scheduled envelope display.

Key existing infrastructure:
- `channel_session_bindings` table: `(agent_name, adapter_type, chat_id) -> session_id` — already supports multiple bindings per session.
- `ChatAdapter` interface in `src/adapters/types.ts`.
- WebSocket event system broadcasting to connected clients.
- Router in `src/daemon/router/message-router.ts`.
- Relay broker manager in `src/daemon/relay/broker-manager.ts`.
- Frontend `AppStateProvider` with reducer, conversations, relay states.

## Goals / Non-Goals

**Goals:**
- Console is a first-class adapter with `channel:console:<chat-id>` addressing.
- Console adapter delivers via WebSocket push (`console.message` event).
- Sessions can be bound to multiple adapters (e.g., both Telegram and console).
- Router fans out agent replies to all adapters bound to the same session.
- Console can send as any adapter's address (boss privilege) with `origin: "console"`.
- Session management API: list, create, add/remove bindings.
- Web frontend shows unified session-based chat list with adapter badges.
- Slash commands work correctly end-to-end.
- Relay PTY mode works end-to-end (toggle, interactive terminal, bidirectional I/O).
- `@` mention rendering, origin indicators, file upload, scheduled envelopes, reply threading.

**Non-Goals:**
- Mobile app adapter (future; "console" naming accommodates this).
- Syncing message history between adapters (each gets messages after binding).
- Console adapter as standalone service (runs within daemon process).
- New auth mechanism (uses existing boss token).
- Team management UI or team chat wiring beyond what exists.

## Decisions

### 1. Console adapter delivers via WebSocket (not HTTP polling)

The daemon already maintains WebSocket connections. The console adapter's `sendMessage()` pushes a `console.message` event to connected boss-token clients. No new transport needed.

### 2. Router fan-out at channel delivery time

When the router delivers to a channel address, it looks up the session, finds all other bindings, and delivers to each. Fan-out happens in the router's outbound path (not executor). Agent stays unaware of multi-adapter delivery.

**Alternative rejected:** Executor fan-out (creates duplicate envelopes in DB).

### 3. Send-as-adapter uses existing `from` field

Console sends to Telegram chat using `from: channel:telegram:12345` with `metadata.origin: "console"`. Agent sees the same sender format as real Telegram. Only boss tokens can use arbitrary `from` addresses.

### 4. Session binding management via explicit API

Bindings managed via `POST/DELETE /api/agents/:name/sessions/:id/bindings`. No automatic binding — operator explicitly links sessions.

### 5. No schema migration needed

`channel_session_bindings` already supports multiple rows per `session_id`. Console is just another `adapter_type` value.

### 6. Slash command server-side fixes

Slash commands (`/abort`, `/refresh`, `/interrupt`) are sent from the composer, handled client-side in the chat page, and call the correct API endpoints. The issue is that some RPC handlers may not properly handle admin-token invocations. Fix: ensure all slash command RPC endpoints accept admin token principal.

### 7. Relay PTY wiring: Hi-Boss as relay proxy

All PTY data flows through Hi-Boss's single WS connection:
- `agent.pty.output` (server -> client): raw PTY chunks from relay broker
- `agent.pty.input` (client -> server): keystrokes from browser terminal

The relay broker is transparent to the frontend.

### 8. Session-based chat list replaces conversation-based

Frontend chat list transitions from conversation-based (derived from `chatScope` metadata) to session-based (from session management API). Each session shows its adapter bindings as badges. Console sessions and Telegram sessions appear in one unified list.

## Risks / Trade-offs

**[Risk] Fan-out creates duplicate deliveries if adapter is offline** -> Mitigation: Console adapter marks delivery successful even if no WS client connected; message persists in envelope store; client sees it on reconnect via envelope list.

**[Risk] Send-as-adapter could be abused** -> Mitigation: Only boss-token holders can use arbitrary `from` addresses. Agent tokens restricted to their bound channels.

**[Risk] Multiple console clients simultaneously** -> Mitigation: Deliver to ALL connected boss-token WS clients. Multiple browser tabs all receive messages.

**[Trade-off] Fan-out adds one DB query per channel delivery** -> Acceptable: single indexed lookup on `session_id`.

**[Risk] Relay broker binary not installed** -> Mitigation: Graceful degradation — relay mode disabled, pipe mode works. UI shows toggle as disabled with tooltip.

**[Risk] Session resume on relay mode switch fails** -> Mitigation: Fallback to fresh session with toast notification.
