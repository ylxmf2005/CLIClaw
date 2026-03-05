## MODIFIED Requirements

### Requirement: Demo team group chat
The demo page SHALL display a fully functional team group chat view with mock messages from multiple senders, a toggleable member panel, and a demo-mode composer.

#### Scenario: Team chat shows mock messages
- **WHEN** user selects a team in the demo Chats or Teams tab
- **THEN** the team chat view SHALL render mock envelopes using the shared `MessageList` component, showing messages from multiple agents (e.g., nex, shieru, codex-worker) with correct sender colors and timestamps

#### Scenario: Member panel toggle
- **WHEN** user clicks the members toggle in the team chat header
- **THEN** a side panel SHALL appear listing all team members with their status indicators (idle/running) from `MOCK_AGENT_STATUSES`

#### Scenario: Demo composer with @mention hint
- **WHEN** the team chat view is displayed
- **THEN** the composer SHALL show a placeholder text mentioning @mention (e.g., "Message team... Use @name to mention") and SHALL be read-only (no actual send capability)

#### Scenario: Team entries in Chats tab show last message
- **WHEN** mock team envelopes exist in `MOCK_ENVELOPES`
- **THEN** team entries in the Chats tab SHALL display `lastMessage` and `lastMessageAt` computed from the most recent team envelope, and entries SHALL be sorted by recency alongside agent chats

## ADDED Requirements

### Requirement: Mock team envelope data
The mock data module SHALL include team envelopes keyed by `team:<name>` containing messages from multiple senders, including an @all broadcast message and @mention messages.

#### Scenario: Team envelopes structure
- **WHEN** mock data is loaded
- **THEN** `MOCK_ENVELOPES` SHALL contain a `team:alpha-squad` key with at least 4 envelopes from different senders, including one with @all and one with an @mention

### Requirement: Mock team conversations
The mock data module SHALL include team entries in `MOCK_CONVERSATIONS` so teams appear in the Chats tab sorted list.

#### Scenario: Team conversations in chat list
- **WHEN** demo left panel renders the Chats tab
- **THEN** team conversations SHALL appear alongside agent conversations, sorted by `lastMessageAt`, with the team icon and last message preview
