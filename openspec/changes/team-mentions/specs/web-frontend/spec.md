## ADDED Requirements

### Requirement: Team chat mention bar
The team chat composer SHALL include a mention bar above the textarea displaying selected mention chips.

#### Scenario: Mention bar visible in team chat
- **WHEN** user is on a team chat page (`/teams/:name`)
- **THEN** a mention bar SHALL be visible above the composer textarea

#### Scenario: Mention bar hidden in agent chat
- **WHEN** user is on an agent chat page (`/agents/:name/:chatId`)
- **THEN** no mention bar SHALL be shown

#### Scenario: Empty mention bar shows hint
- **WHEN** no mentions are selected
- **THEN** the mention bar SHALL display a hint text like "@mention a member or @all to send"

### Requirement: @mention autocomplete dropdown
The team chat composer SHALL provide an autocomplete dropdown for selecting team members to mention.

#### Scenario: Trigger via @ button
- **WHEN** user clicks the `@` button in the mention bar area
- **THEN** an autocomplete dropdown SHALL appear listing `@all` first, then all unmentioned team members

#### Scenario: Trigger via keyboard
- **WHEN** user types `@` in the textarea
- **THEN** an autocomplete dropdown SHALL appear anchored near the textarea, listing `@all` first, then all unmentioned team members

#### Scenario: Filter by typing
- **WHEN** user types `@ne` in the textarea
- **THEN** the dropdown SHALL filter to members whose names start with "ne" (case-insensitive)

#### Scenario: Keyboard navigation
- **WHEN** the dropdown is visible
- **THEN** arrow keys SHALL navigate items, Enter/Tab SHALL select the highlighted item, Escape SHALL dismiss

#### Scenario: Mouse selection
- **WHEN** user clicks a member name in the dropdown
- **THEN** the member SHALL be added to the mention bar as a chip and the dropdown SHALL close

#### Scenario: Dropdown positioning
- **WHEN** the dropdown is triggered
- **THEN** it SHALL appear above or below the composer (depending on available space) and SHALL not overflow the viewport

### Requirement: Mention chip rendering
Selected mentions SHALL appear as styled, removable chips in the mention bar.

#### Scenario: Chip displays member name
- **WHEN** `@nex` is selected from autocomplete
- **THEN** a chip labeled "nex" with an `x` remove button SHALL appear in the mention bar

#### Scenario: @all chip distinct styling
- **WHEN** `@all` is selected
- **THEN** the chip SHALL have a visually distinct style (e.g., accent color background) to differentiate from individual mentions

#### Scenario: Remove chip
- **WHEN** user clicks the `x` on a mention chip
- **THEN** the chip SHALL be removed and that member SHALL become available in autocomplete again

#### Scenario: @all mutual exclusivity
- **WHEN** user selects `@all` while individual mentions exist
- **THEN** all individual mentions SHALL be cleared and replaced with `@all`

#### Scenario: Individual mention replaces @all
- **WHEN** user selects an individual member while `@all` is active
- **THEN** `@all` SHALL be removed and only the individual mention SHALL remain

### Requirement: Send gate enforces mentions
The team chat send button SHALL be disabled when no mentions are selected.

#### Scenario: Disabled without mentions
- **WHEN** user types a message but has no mention chips
- **THEN** the send button SHALL be visually disabled and clicking it SHALL have no effect

#### Scenario: Enabled with mentions and text
- **WHEN** user has at least one mention chip and non-empty message text
- **THEN** the send button SHALL be enabled

#### Scenario: Disabled with mentions but no text
- **WHEN** user has mention chips but empty message text (and not a slash command)
- **THEN** the send button SHALL be disabled

### Requirement: Team slash commands
The team chat composer SHALL support slash commands that target mentioned members.

#### Scenario: Command picker in team context
- **WHEN** user types `/` in the team chat composer
- **THEN** the command autocomplete SHALL show team-relevant commands: `/status`, `/abort`, `/refresh`, `/interrupt`

#### Scenario: Command execution with mentions
- **WHEN** user selects `/status` command and has `@nex` in the mention bar
- **THEN** the system SHALL call the agent status API for `nex` and display the result

#### Scenario: Command execution with @all
- **WHEN** user selects `/status` and has `@all` in the mention bar
- **THEN** the system SHALL call the agent status API for each team member and display results

#### Scenario: Command without text body
- **WHEN** user selects a slash command like `/status`
- **THEN** the command SHALL execute without requiring additional text in the message body

### Requirement: Team message send with mentions payload
The team chat page SHALL send the `mentions` array alongside the message when calling the envelope send API.

#### Scenario: Send with individual mentions
- **WHEN** user sends a message with `@nex` and `@walt` chips and text "sync up"
- **THEN** `POST /api/envelopes` SHALL be called with `to: "team:<name>"`, `mentions: ["nex", "walt"]`, `text: "sync up"`

#### Scenario: Send with @all
- **WHEN** user sends a message with `@all` chip and text "standup"
- **THEN** `POST /api/envelopes` SHALL be called with `to: "team:<name>"`, `mentions: ["@all"]`, `text: "standup"`

#### Scenario: Mentions cleared after send
- **WHEN** a team message is successfully sent
- **THEN** the mention bar SHALL be cleared (all chips removed) and the textarea SHALL be cleared

## MODIFIED Requirements

### Requirement: Demo Composer with @mention hint
The demo page SHALL display a fully functional team group chat view with mock messages from multiple senders, a toggleable member panel, and a demo-mode composer.

The demo team composer SHALL show a placeholder referencing @mention usage and SHALL support a mock mention bar matching the live implementation's visual design.

#### Scenario: Demo composer with @mention hint
- **WHEN** the team chat view is displayed in demo mode
- **THEN** the composer SHALL show placeholder text "@mention a member or @all" and display a non-interactive mention bar matching the live design
