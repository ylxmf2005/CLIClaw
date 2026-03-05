## Why

The web management console can currently only interact with agents via direct `agent:<name>:<chatId>` addressing. It cannot see or participate in conversations happening through external adapters like Telegram. Operators need a unified view of all agent conversations — regardless of which adapter originated them — and the ability to send messages into any adapter's chat from the console. Additionally, the console should be a first-class adapter so console-native chats are routable and agents can reply to them like any other channel.

## What Changes

- Introduce a **console adapter** with address format `channel:console:<chat-id>`, delivering messages via WebSocket push to connected clients.
- Add **multi-bound sessions**: a single agent session can be bound to multiple adapters simultaneously (e.g., both `telegram:12345` and `console:abc`). All bound adapters receive the agent's replies.
- Add **router fan-out**: when an agent replies to any channel address, the router looks up the session, finds all bindings, and delivers to each bound adapter — not just the addressed one.
- Allow the console to **send as any adapter's address** (e.g., `from: channel:telegram:12345` with `origin: "console"` in metadata), so the agent sees the message as coming from that adapter's chat.
- Add **session binding management**: API to add/remove adapter bindings on a session, enabling conversion between console and non-console sessions.
- Add **session listing API**: enumerate all sessions for an agent with their adapter bindings, so the console can display a unified chat list.
- Update the **web frontend** to show adapter-specific chat sessions, send-as-adapter, and manage session bindings.

## Capabilities

### New Capabilities
- `console-adapter`: Console adapter implementation — address format, WebSocket-based delivery, session creation, and registration with the daemon.

### Modified Capabilities
- `envelope`: Router fan-out — when delivering to a channel address, deliver to all adapters bound to the same session, not just the addressed adapter.
- `agent`: Session binding management — API to add/remove adapter bindings on a session; session listing with binding info; multi-bound session support.
- `web-frontend`: Console chat integration — unified chat list showing all adapter sessions, send-as-adapter, session binding UI, console adapter session creation.

## Impact

- **Router** (`src/daemon/router/message-router.ts`): Add fan-out logic for channel replies.
- **Adapters** (`src/adapters/`): New `console.adapter.ts`; update adapter types interface.
- **Bridge** (`src/daemon/bridges/channel-bridge.ts`): Support console adapter registration and delivery.
- **HTTP API**: New endpoints for session listing, session binding management.
- **DB**: No schema changes — `channel_session_bindings` already supports multiple bindings per session.
- **Web frontend**: Major update to chat list, chat view, and composer to support adapter-aware sessions.
- **Agent instructions**: No change — agents see the same sender format regardless of whether the message came from Telegram directly or via console.
