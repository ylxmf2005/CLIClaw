## ADDED Requirements

### Requirement: Unified session-based chat list
The web console SHALL display a unified chat list showing all agent sessions across all adapters. Each entry SHALL show the adapter type (icon/badge), the chat identifier, the agent name, and last message preview. Sessions with multiple bindings SHALL show all bound adapters.

#### Scenario: Chat list shows Telegram and console sessions
- **WHEN** agent nex has a Telegram session and a console session
- **THEN** both appear in the chat list with their respective adapter badges

#### Scenario: Multi-bound session shown once
- **WHEN** a session has both Telegram and console bindings
- **THEN** it appears as one entry in the chat list with both adapter badges

### Requirement: Send-as-adapter from console
The web console SHALL allow the boss to send messages into any adapter's chat session. When sending into a non-console session (e.g., Telegram), the message SHALL use the adapter's channel address as the `from` field with `origin: "console"` in metadata.

#### Scenario: Send message into Telegram chat
- **WHEN** boss types a message in a Telegram chat session viewed on the console
- **THEN** the envelope is sent with `from: channel:telegram:<chat-id>` and `origin: "console"`

#### Scenario: Send message in console-native chat
- **WHEN** boss types a message in a console chat session
- **THEN** the envelope is sent with `from: channel:console:<chat-id>`

### Requirement: Console chat creation
The web console SHALL provide a way to create new console-native chat sessions with an agent. This SHALL call `POST /api/agents/:name/sessions { adapterType: "console" }` and navigate to the new chat.

#### Scenario: Create new console chat
- **WHEN** boss clicks "New chat" on agent nex
- **THEN** a new console session is created via API
- **THEN** the console navigates to the new chat view

### Requirement: Session binding management UI
The web console SHALL provide UI to manage session bindings. From a chat view, the boss SHALL be able to:
- View all bindings for the current session
- Add a binding (link to another adapter's chat)
- Remove a binding (unlink an adapter's chat)

#### Scenario: View session bindings
- **WHEN** boss opens a chat that has both Telegram and console bindings
- **THEN** the chat header or settings shows both bindings with adapter type and chat ID

#### Scenario: Add console binding to Telegram session
- **WHEN** boss clicks "Link to console" on a Telegram-only session
- **THEN** a console binding is added to the session
- **THEN** the chat now shows both Telegram and console badges

### Requirement: Receive console adapter messages via WebSocket
The web console SHALL listen for `console.message` WebSocket events and display them in real-time in the appropriate chat view.

#### Scenario: Real-time message from agent reply
- **WHEN** an agent replies and the router fans out to the console adapter
- **THEN** the console receives a `console.message` WebSocket event
- **THEN** the message appears in the chat view without page refresh
