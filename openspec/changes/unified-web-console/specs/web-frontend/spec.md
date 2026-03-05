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
The web console SHALL provide UI to manage session bindings from the chat header or settings. The boss SHALL be able to view, add, and remove bindings.

#### Scenario: View session bindings
- **WHEN** boss opens a chat that has both Telegram and console bindings
- **THEN** the chat header or settings shows both bindings with adapter type and chat ID

#### Scenario: Add console binding to Telegram session
- **WHEN** boss clicks "Link to console" on a Telegram-only session
- **THEN** a console binding is added to the session
- **THEN** the chat now shows both Telegram and console badges

### Requirement: Receive console adapter messages via WebSocket
The web console SHALL listen for `console.message` WebSocket events and display them in real-time.

#### Scenario: Real-time message from agent reply
- **WHEN** an agent replies and the router fans out to the console adapter
- **THEN** the console receives a `console.message` WebSocket event
- **THEN** the message appears in the chat view without page refresh

### Requirement: Slash commands work end-to-end
The web console slash commands (/abort, /refresh, /interrupt) SHALL call the correct daemon API endpoints and produce the expected side effects.

#### Scenario: Abort command
- **WHEN** boss types /abort in the composer
- **THEN** the frontend calls `POST /api/agents/:name/abort`
- **THEN** the agent's running process is terminated

#### Scenario: Interrupt command
- **WHEN** boss types /interrupt in the composer
- **THEN** the frontend sends an envelope with `interruptNow: true`
- **THEN** the agent receives it as a priority message

### Requirement: Relay mode PTY end-to-end
When relay mode is enabled for a chat, the terminal SHALL be bidirectional. Boss keystrokes flow to the agent's PTY, and PTY output flows to the terminal.

#### Scenario: Interactive terminal with relay on
- **WHEN** relay mode is toggled on for a chat
- **THEN** the terminal becomes interactive
- **THEN** boss keystrokes are sent via `agent.pty.input` WS messages
- **THEN** PTY output arrives via `agent.pty.output` WS messages and renders in xterm.js

#### Scenario: Relay unavailable
- **WHEN** relay broker binary is not installed
- **THEN** the relay toggle is disabled with a tooltip explaining the missing dependency

## MODIFIED Requirements

### Requirement: Production app loads real data on mount
The `AppStateProvider` SHALL fetch real data from the daemon HTTP API on mount: agents via `GET /api/agents`, agent statuses, daemon status, and sessions via `GET /api/agents/:name/sessions`. Loading state SHALL be shown while fetching.

#### Scenario: Initial data load
- **WHEN** the authenticated user's `AppStateProvider` mounts
- **THEN** it SHALL fetch agents, statuses, daemon status, and sessions from the real API

#### Scenario: API unreachable on mount
- **WHEN** the daemon API is unreachable during initial load
- **THEN** the frontend SHALL show an error state with a retry option
