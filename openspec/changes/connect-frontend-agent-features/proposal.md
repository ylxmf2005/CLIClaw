## Why

The web frontend has a complete UI shell (Telegram-style layout, components, demo page) but is entirely disconnected from the daemon backend. The daemon only exposes a Unix socket JSON-RPC server — no HTTP or WebSocket server exists yet. To make the frontend usable, we need to build the HTTP+WS bridge in the daemon and wire the frontend to real data, starting with agent-related features (management, chat, status).

Additionally, the current executor runs provider CLIs in non-interactive `-p` pipe mode. By integrating `@agent-relay/sdk`, we can offer an optional interactive PTY mode per chat — giving the boss a live, interactive terminal into the agent's provider CLI session.

## What Changes

- **Add HTTP REST server** to the daemon process that translates REST requests to internal RPC calls (port 3889)
- **Add WebSocket server** to the daemon for real-time event push (agent status, new envelopes, agent logs, PTY output)
- **Add agent detail/edit view** — currently missing; the `updateAgent()` API client method exists but no UI calls it
- **Add agent delete flow** with confirmation dialog — `deleteAgent()` exists in client but no UI
- **Add multi-chat support in production** — demo has per-agent expandable chat list, production hardcodes `chatId: "default"`
- **Wire all agent components to real daemon APIs** — replace mock/demo data paths with live API calls via `AppStateProvider`
- **Wire chat view to real envelope send/receive** — connect `MessageComposer` to `POST /api/envelopes`, load conversations from `GET /api/envelopes` using `chatId` mapped to `metadata.chatScope`
- **Add `@` mention rendering** for cross-destination messages — outbound shows `@recipient`, inbound shows `@this-agent`, derived from envelope to/from fields; messages appear in both sender's and receiver's chats
- **Wire terminal view** — relay off: read-only log streaming; relay on: interactive PTY terminal (bidirectional xterm.js)
- **Add agent binding management UI** (bind/unbind Telegram adapter)
- **Integrate `@agent-relay/sdk`** — optional per-chat relay mode for interactive PTY sessions; daemon starts broker on startup; per-agent default + per-chat toggle; session resume on mode switch
- **Add resizable split pane** — terminal split pane width draggable (currently fixed 420px)

## Capabilities

### New Capabilities
- `daemon-http-ws`: HTTP REST + WebSocket server embedded in daemon, translating REST to RPC and pushing real-time events to connected clients
- `agent-management-ui`: Agent detail view, edit form, delete flow, and binding management in the web frontend
- `agent-relay-integration`: Optional per-chat interactive PTY mode via `@agent-relay/sdk`, with relay broker lifecycle managed by daemon

### Modified Capabilities
- `web-frontend`: Production frontend wired to real daemon APIs; multi-chat per agent; `@` mention rendering for cross-destination visibility; interactive terminal; resizable split pane; relay toggle in chat header and agent settings

## Impact

- **Daemon** (`src/daemon/`): New `http/` and `ws/` modules; event emission hooks throughout existing code; `@agent-relay/sdk` integration for optional PTY executor path; broker lifecycle management
- **Web frontend** (`web/src/`): `AppStateProvider` wired to real API; new agent detail/edit/delete components; `ChatListPanel` upgraded to multi-chat; `TerminalView` bidirectional when relay on; `MessageContent` auto-`@` rendering; resizable split pane
- **Agent executor** (`src/agent/`): Dual executor path — pipe mode (existing) and relay/PTY mode (new); per-chat mode tracking
- **Dependencies**: `ws` package for WebSocket server; `@agent-relay/sdk` for PTY integration (requires `agent-relay-broker` binary)
- **APIs**: No breaking changes — adds HTTP surface mapping 1:1 to existing RPC methods; new WS message types for PTY I/O
