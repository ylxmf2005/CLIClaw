## MODIFIED Requirements

### Requirement: Production app loads real data on mount
The `AppStateProvider` SHALL fetch real data from the daemon HTTP API on mount: agents via `GET /api/agents`, agent statuses via `GET /api/agents/:name` for each agent, and daemon status via `GET /api/daemon/status`. Loading state SHALL be shown while fetching.

#### Scenario: Initial data load
- **WHEN** the authenticated user's `AppStateProvider` mounts
- **THEN** it SHALL fetch agents, statuses, and daemon status from the real API and populate the reducer state

#### Scenario: API unreachable on mount
- **WHEN** the daemon API is unreachable during initial load
- **THEN** the frontend SHALL show an error state with a retry option

### Requirement: WebSocket events update real-time state
The `AppStateProvider` SHALL handle WebSocket events to update state in real-time. Events include: `agent.registered`, `agent.deleted`, `agent.status`, `agent.log`, `envelope.new`, `envelope.done`, `run.started`, `run.completed`.

#### Scenario: New agent registered via WebSocket
- **WHEN** an `agent.registered` event is received
- **THEN** the agent SHALL be added to the agents list in state without a page refresh

#### Scenario: Agent deleted via WebSocket
- **WHEN** an `agent.deleted` event is received
- **THEN** the agent SHALL be removed from state and if the deleted agent's chat was selected, the view SHALL clear

#### Scenario: Agent status update via WebSocket
- **WHEN** an `agent.status` event is received
- **THEN** the agent's status indicator SHALL update (idle/running/error) without a page refresh

#### Scenario: New envelope via WebSocket
- **WHEN** an `envelope.new` event is received
- **THEN** the envelope SHALL be appended to the relevant conversation's message list and the chat list SHALL re-sort by recency

#### Scenario: Agent log line via WebSocket
- **WHEN** an `agent.log` event is received
- **THEN** the log line SHALL appear in the terminal view (if open for that agent) and update the agent card's log preview

### Requirement: Multi-chat per agent in production
The production `ChatListPanel` SHALL support multiple conversations per agent, matching the demo's expandable chat list. Each agent in the sidebar SHALL be expandable to show its conversations, derived from envelope `chatScope` metadata. A "New Chat" action SHALL send to `agent:<name>:new`.

#### Scenario: Agent with multiple conversations
- **WHEN** an agent has envelopes with different `chatScope` values
- **THEN** the chat list SHALL show the agent as expandable with each conversation as a sub-item

#### Scenario: Start new chat with agent
- **WHEN** the user clicks "New Chat" on an agent
- **THEN** the frontend SHALL generate a new chatId locally, select the new empty conversation, and the first message SHALL be sent to `agent:<name>:<new-chatId>` (this is NOT the `/new` CLI command — it simply opens a fresh conversation with a new chat scope)

#### Scenario: Select existing conversation
- **WHEN** the user clicks a specific conversation under an agent
- **THEN** the chat view SHALL load envelopes using `GET /api/envelopes` with `to=agent:<name>` and `chatId=<chatId>` (`chatId` maps to `metadata.chatScope`) and display them

### Requirement: Chat view sends and receives real envelopes
The chat view `MessageComposer` SHALL send messages via `POST /api/envelopes` with the correct `to` address (`agent:<name>:<chatId>`). The `MessageList` SHALL load existing envelopes from `GET /api/envelopes` using `to=agent:<name>` + `chatId=<chatId>` (`chatId` maps to `metadata.chatScope`) and receive new ones via WebSocket `envelope.new` events.

#### Scenario: Send message to agent
- **WHEN** the user types a message and presses send
- **THEN** the frontend SHALL call `POST /api/envelopes` with `{ to: "agent:<name>:<chatId>", text: "<message>" }` and the sent message SHALL appear in the message list

#### Scenario: Load conversation history
- **WHEN** a conversation is selected
- **THEN** the frontend SHALL fetch envelopes for that conversation from `GET /api/envelopes` with `to=agent:<name>` and `chatId=<chatId>` and display them in chronological order

#### Scenario: Receive agent response in real-time
- **WHEN** the agent processes the message and replies
- **THEN** the `envelope.new` WebSocket event SHALL cause the response to appear in the message list automatically

### Requirement: Terminal view streams real agent logs
The `TerminalView` SHALL connect to real agent log streaming via WebSocket `agent.log` events. When the terminal is open for an agent, all log lines for that agent SHALL be rendered in the xterm.js terminal.

#### Scenario: Open terminal for running agent
- **WHEN** the user opens the terminal split pane while an agent is running
- **THEN** new log lines from the `agent.log` WebSocket events SHALL appear in the terminal in real-time

#### Scenario: Terminal shows logs for selected agent only
- **WHEN** the user switches between agents
- **THEN** the terminal SHALL clear and show logs only for the newly selected agent

### Requirement: Agent abort and refresh use real API
The abort and refresh buttons in the chat header SHALL call the real daemon API endpoints.

#### Scenario: Abort running agent
- **WHEN** the user clicks the abort button while an agent is running
- **THEN** the frontend SHALL call `POST /api/agents/:name/abort` and the agent's status SHALL update to idle

#### Scenario: Refresh agent session
- **WHEN** the user clicks the refresh button
- **THEN** the frontend SHALL call `POST /api/agents/:name/refresh` and show a success toast

### Requirement: Auto `@` rendering for cross-destination messages
The `MessageList` SHALL auto-render `@` mentions based on envelope `to`/`from` fields to give the boss visibility into all agent communication. The `@` is NOT typed by agents — it is derived by the UI from envelope addressing.

#### Scenario: Outbound message to another agent
- **WHEN** an agent sends an envelope to `agent:<other>:<chatId>` and the boss views the sender's chat
- **THEN** the message SHALL render with `@other` prefix (e.g., `nex: @shieru Can you check this?`)

#### Scenario: Inbound message from another agent
- **WHEN** agent B sends to `agent:A:<chatId>` and the boss views agent A's chat
- **THEN** the message SHALL render with `@A` prefix showing who it's addressed to (e.g., `shieru: @nex Here's the report`)

#### Scenario: Message to channel
- **WHEN** an agent sends to `channel:telegram:12345`
- **THEN** the message SHALL render with `@telegram:12345` prefix

#### Scenario: Message to team
- **WHEN** an agent sends to `team:core-dev`
- **THEN** the message SHALL render with `@core-dev` prefix

#### Scenario: Messages appear in both chats
- **WHEN** agent A sends to agent B
- **THEN** the message SHALL appear in both agent A's and agent B's conversation views

### Requirement: Boss visibility into all agent communication
The web frontend SHALL give the boss (user) visibility into all envelope traffic — including agent-to-agent, agent-to-team, and agent-to-channel messages. The `envelope.new` WebSocket event carries all envelopes regardless of sender/recipient, so the frontend SHALL route and display them appropriately.

#### Scenario: Agent sends to another agent
- **WHEN** agent A sends an envelope to `agent:B:<chatId>`
- **THEN** the `envelope.new` event SHALL cause the message to appear in the relevant conversation view, and the chat list SHALL update with the new last message preview

#### Scenario: Agent sends to a team
- **WHEN** an agent sends to `team:<teamName>`
- **THEN** the message SHALL appear in the team chat view with the sender clearly identified, and the team entry in the chat list SHALL update

#### Scenario: Agent mentions another agent in team
- **WHEN** an agent sends to `team:<teamName>` and the message contains `@agentName`
- **THEN** the `MessageContent` component SHALL highlight the `@mention` (wire the existing but unused `mentions` prop)

#### Scenario: Unread indicator for agent activity
- **WHEN** a new envelope arrives for a conversation that is NOT currently selected
- **THEN** the chat list item SHALL show an unread indicator (wire the existing but always-zero `unreadCount` field in `ChatListItem`)

### Requirement: Conversations derived from envelope chat scopes
The frontend SHALL derive the list of conversations per agent from envelope metadata. Each unique `chatScope` value for an agent represents a distinct conversation. The conversation list SHALL be sorted by most recent activity.

#### Scenario: Derive conversations from envelopes
- **WHEN** envelopes are loaded for an agent
- **THEN** the frontend SHALL group them by `chatScope` and display each group as a conversation with the most recent message as preview

#### Scenario: New conversation appears from WebSocket event
- **WHEN** an `envelope.new` event arrives with a new `chatScope` not seen before
- **THEN** a new conversation entry SHALL appear in the agent's chat list
