## Why

The web management console has backend infrastructure (HTTP server, WebSocket, event bus, relay broker) but is missing a console adapter that makes the web a first-class chat channel. Operators cannot see or participate in Telegram conversations from the web, slash commands have server-side handling issues, and relay mode PTY flow is not fully wired. The console adapter unifies all adapter sessions under one view and enables the web to send messages in the character of any adapter.

## What Changes

- Introduce a **console adapter** (`channel:console:<chat-id>`) delivering messages via WebSocket push to connected boss-token clients.
- Add **router fan-out**: when an agent replies to any channel, deliver to ALL adapters bound to the same session (not just the addressed one).
- Allow the console to **send as any adapter's address** (e.g., `from: channel:telegram:12345` with `origin: "console"` in metadata).
- Add **session management API**: list sessions with bindings, create sessions, add/remove bindings.
- Add **`console.message` WebSocket event** for real-time console delivery.
- Update **web frontend** to session-based chat list showing all adapter sessions with badges, send-as-adapter, binding management UI.
- Fix **slash command handling** on server side (abort, refresh, interrupt) and wire correctly from frontend.
- Wire **relay mode** PTY flow end-to-end (toggle, interactive terminal, xterm.js bidirectional I/O).
- Add remaining frontend features: `@` mention rendering, file upload wiring, origin indicators, scheduled envelope display, reply-to-message threading.

## Capabilities

### New Capabilities
- `console-adapter`: Console adapter implementation — address format `channel:console:<chat-id>`, WebSocket-based delivery, session creation, daemon registration.

### Modified Capabilities
- `envelope`: Router fan-out — deliver to all adapters bound to the same session, not just the addressed adapter. Send-as-adapter validation for boss tokens.
- `agent`: Session listing API with bindings, session creation, binding add/remove management.
- `web-frontend`: Session-based chat list, console adapter integration, send-as-adapter, binding management UI, slash command fixes, relay PTY wiring, `@` mention rendering, origin indicators, file upload, scheduled envelopes, reply threading.

## Impact

- **Adapters** (`src/adapters/`): New `console.adapter.ts`; add `"console"` to adapter type constants.
- **Router** (`src/daemon/router/message-router.ts`): Fan-out logic for channel replies; co-binding lookup.
- **RPC** (`src/daemon/rpc/envelope-send-core.ts`): Boss-token `from` address override with `origin: "console"`.
- **HTTP API** (`src/daemon/http/`): New session listing, creation, binding management endpoints.
- **DB** (`src/daemon/db/`): New helper `getCoBindingsForSession()`; no schema changes needed.
- **WS** (`src/daemon/ws/server.ts`): New `console.message` event type.
- **Web frontend** (`web/src/`): Major updates to chat list (session-based), chat view (send-as-adapter, slash commands), composer (relay toggle), terminal (PTY wiring), and shared components (`@` rendering, origin badges).
