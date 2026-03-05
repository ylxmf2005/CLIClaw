## Context

Hi-Boss currently supports Telegram as its only external adapter. The web management console sends messages using direct `agent:<name>:<chatId>` addressing and cannot see or participate in conversations happening through external adapters. Operators must switch between Telegram and the console for different conversations.

The console adapter makes the web console a first-class adapter alongside Telegram, with shared session support so operators get a unified view of all agent conversations.

Key existing infrastructure:
- `channel_session_bindings` table: `(agent_name, adapter_type, chat_id) → session_id` — already supports multiple bindings per session since the unique constraint is on the three-column tuple, not on `session_id`.
- `ChatAdapter` interface in `src/adapters/types.ts` — defines `sendMessage()`, `onMessage()`, etc.
- WebSocket event system — already broadcasts `envelope.new` events to connected clients.
- Router in `src/daemon/router/message-router.ts` — handles envelope delivery to adapters.

## Goals / Non-Goals

**Goals:**
- Console is a first-class adapter with address format `channel:console:<chat-id>`.
- Console adapter delivers messages via WebSocket push.
- Sessions can be bound to multiple adapters simultaneously (e.g., both Telegram and console).
- Router fans out agent replies to all adapters bound to the same session.
- Console can send messages as any adapter's address (boss privilege), with `origin: "console"` metadata.
- API for listing sessions with their bindings and managing bindings (add/remove).
- Web frontend shows a unified chat list of all adapter sessions.

**Non-Goals:**
- Mobile app adapter (future work; "console" naming accommodates this).
- Relay/PTY mode for console adapter (existing relay mode is separate).
- Console adapter authentication beyond existing boss token.
- Syncing message history between adapters (each adapter only receives messages sent after binding).
- Console adapter as a standalone service (it runs within the daemon process).

## Decisions

### 1. Console adapter delivers via WebSocket (not HTTP polling)

The daemon already maintains WebSocket connections with authenticated clients. The console adapter's `sendMessage()` implementation pushes a targeted WebSocket event to the connected client(s). No new transport needed.

**Alternative considered:** HTTP long-polling or SSE. Rejected because WebSocket is already established and provides bidirectional communication for relay mode.

### 2. Router fan-out at channel delivery time

When the router delivers an envelope to a channel address (e.g., `channel:telegram:12345`), it looks up the session for that binding, then finds all other bindings for the same session, and delivers to each bound adapter.

The fan-out happens in the router's outbound path, not in the executor. This keeps the agent unaware of multi-adapter delivery.

**Alternative considered:** Executor fan-out (executor creates multiple envelopes). Rejected because it mixes delivery concerns with execution concerns and would create duplicate envelopes in the database.

**Alternative considered:** Agent replies to session address (`session:<id>`). Rejected because it changes the agent's reply interface and breaks existing agent behavior.

### 3. Console send-as-adapter uses existing `from` field

When the console sends into a Telegram chat, the envelope uses `from: channel:telegram:12345`. The boss token authorizes this. Metadata `origin: "console"` distinguishes it from a real Telegram message for audit purposes.

This means the agent sees the same sender format it would see from Telegram, and replies route back naturally.

**Alternative considered:** New `from` address like `channel:console:boss` with session routing metadata. Rejected because it complicates sender line rendering and requires the agent to understand a new address format.

### 4. Session binding management via explicit API

Bindings are managed via `POST/DELETE /api/agents/:name/sessions/:id/bindings`. Creating a console chat automatically creates a console binding. Binding a console session to a Telegram chat adds a second binding to the same session.

No automatic binding — the operator explicitly chooses to link sessions.

### 5. No schema migration needed

`channel_session_bindings` already supports multiple rows per `session_id`. The console adapter is just another `adapter_type` value. No new tables or columns required.

## Risks / Trade-offs

**[Risk] Fan-out creates duplicate deliveries if adapter is offline** → Mitigation: Console adapter marks delivery failed if no WebSocket client is connected. The envelope remains in the store and the console will see it on next connection (via envelope list query).

**[Risk] Send-as-adapter could be abused** → Mitigation: Only boss-token holders can send with arbitrary `from` addresses. Agent tokens are restricted to their bound channels (existing validation).

**[Risk] Multiple console clients connected simultaneously** → Mitigation: Console adapter delivers to ALL connected WebSocket clients with the boss token. This is intentional — multiple browser tabs should all receive messages.

**[Trade-off] Fan-out adds latency to channel delivery** → Acceptable: One additional DB query per channel delivery to look up co-bindings. This is a single indexed lookup on `session_id`.
