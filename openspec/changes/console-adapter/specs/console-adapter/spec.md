## ADDED Requirements

### Requirement: Console adapter registration
The daemon SHALL register a console adapter with `adapter_type: "console"` on startup. The console adapter SHALL implement the `ChatAdapter` interface. The adapter SHALL be active whenever the daemon is running (no separate enable/disable lifecycle).

#### Scenario: Daemon starts with console adapter
- **WHEN** the daemon starts
- **THEN** a console adapter is registered and available for message delivery

### Requirement: Console address format
The console adapter SHALL use the address format `channel:console:<chat-id>` where `<chat-id>` is a unique identifier for each console chat session. New chat IDs SHALL be generated using the existing `generateChatId()` utility.

#### Scenario: Console chat address
- **WHEN** a console chat is created with chat-id "console-chat-abc123"
- **THEN** the address is `channel:console:console-chat-abc123`

### Requirement: Console adapter delivery via WebSocket
The console adapter's `sendMessage()` SHALL deliver messages by emitting a WebSocket event to all connected clients authenticated with the boss token. The event type SHALL be `console.message` and include the envelope data.

#### Scenario: Agent replies to console chat
- **WHEN** an agent sends a reply to `channel:console:abc123`
- **THEN** the console adapter emits a `console.message` WebSocket event to all connected boss clients
- **THEN** the event payload includes the full envelope data

#### Scenario: No console client connected
- **WHEN** an agent replies to a console chat but no WebSocket client is connected
- **THEN** the message is persisted in the envelope store
- **THEN** the client will see it when it reconnects and queries the envelope list

### Requirement: Console chat session creation
The console SHALL be able to create new chat sessions via `POST /api/agents/:name/sessions` with `adapterType: "console"`. This SHALL create a `channel_session_bindings` entry mapping `(agent_name, "console", chat-id) → new session`.

#### Scenario: Create console chat
- **WHEN** boss sends `POST /api/agents/nex/sessions { adapterType: "console" }`
- **THEN** a new session is created with a console binding
- **THEN** the response includes the session ID and chat address `channel:console:<chat-id>`

### Requirement: Console send-as-adapter
When the console sends a message into an adapter chat (e.g., a Telegram session), the envelope SHALL use the adapter's channel address as the `from` field (e.g., `from: channel:telegram:12345`). The `metadata.origin` SHALL be set to `"console"` to indicate the actual source.

#### Scenario: Boss sends into Telegram chat from console
- **WHEN** boss sends a message from the console targeting a Telegram chat session
- **THEN** the envelope `from` is `channel:telegram:12345`
- **THEN** the envelope `metadata.origin` is `"console"`
- **THEN** the agent sees the message as coming from the Telegram chat

#### Scenario: Only boss token can send-as-adapter
- **WHEN** a non-boss token attempts to send with a `from` address that doesn't match its own adapter
- **THEN** the request is rejected with 403
