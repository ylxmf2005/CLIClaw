## ADDED Requirements

### Requirement: Session listing API
The daemon SHALL provide `GET /api/agents/:name/sessions` that returns all sessions for an agent with their adapter bindings. Each session entry SHALL include the session ID, creation time, last activity time, and a list of bindings (adapter type + chat ID for each).

#### Scenario: List sessions for agent with multiple bindings
- **WHEN** boss requests `GET /api/agents/nex/sessions`
- **THEN** the response includes all sessions for agent nex
- **THEN** each session includes its list of adapter bindings
- **THEN** a session with both Telegram and console bindings shows both in its bindings array

#### Scenario: List sessions for agent with no sessions
- **WHEN** boss requests `GET /api/agents/newagent/sessions`
- **THEN** the response includes an empty sessions array

### Requirement: Session binding management API
The daemon SHALL provide endpoints to add and remove adapter bindings on an existing session:
- `POST /api/agents/:name/sessions/:id/bindings` — add a binding (`adapterType`, `chatId`)
- `DELETE /api/agents/:name/sessions/:id/bindings/:adapterType/:chatId` — remove a binding

Adding a binding SHALL create a `channel_session_bindings` row mapping the new `(agent_name, adapter_type, chat_id)` to the existing session. Removing a binding SHALL delete the corresponding row.

#### Scenario: Bind console to existing Telegram session
- **WHEN** boss sends `POST /api/agents/nex/sessions/abc123/bindings { adapterType: "console", chatId: "console-chat-1" }`
- **THEN** a new binding `(nex, console, console-chat-1) → session-abc123` is created
- **THEN** both Telegram and console now route to the same session

#### Scenario: Unbind console from session
- **WHEN** boss sends `DELETE /api/agents/nex/sessions/abc123/bindings/console/console-chat-1`
- **THEN** the binding `(nex, console, console-chat-1)` is removed
- **THEN** the session still exists with its remaining bindings

#### Scenario: Cannot remove last binding
- **WHEN** boss attempts to remove the last binding from a session
- **THEN** the request is rejected with 400
- **THEN** error message indicates at least one binding must remain

### Requirement: Session creation API
The daemon SHALL provide `POST /api/agents/:name/sessions` to create a new session with an initial binding. The request SHALL include `adapterType` and optionally `chatId` (auto-generated if omitted).

#### Scenario: Create console session
- **WHEN** boss sends `POST /api/agents/nex/sessions { adapterType: "console" }`
- **THEN** a new session is created with a console binding
- **THEN** the response includes the session ID and generated chat ID
