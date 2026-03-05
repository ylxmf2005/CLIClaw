## ADDED Requirements

### Requirement: Multi-mention parsing
The system SHALL parse multiple `@agentName` mentions from the beginning of a team message. Mentions are extracted as a structured `mentions: string[]` array, separate from the message body text. The `@` prefixes SHALL NOT appear in the delivered message text.

#### Scenario: Single mention
- **WHEN** user adds `@nex` to the mention bar and types "please review the PR"
- **THEN** `mentions` is `["nex"]` and `text` is `"please review the PR"`

#### Scenario: Multiple mentions
- **WHEN** user adds `@nex` and `@walt` to the mention bar and types "sync on this"
- **THEN** `mentions` is `["nex", "walt"]` and `text` is `"sync on this"`

#### Scenario: @all broadcast
- **WHEN** user adds `@all` to the mention bar and types "standup in 5"
- **THEN** `mentions` is `["@all"]` and `text` is `"standup in 5"`

#### Scenario: @all excludes individual mentions
- **WHEN** user selects `@all` in the mention bar
- **THEN** all individual mention chips SHALL be cleared and only `@all` remains

#### Scenario: Individual mention after @all replaces it
- **WHEN** user has `@all` selected and then adds `@nex`
- **THEN** `@all` is removed and only `@nex` remains in the mention bar

### Requirement: Mandatory mention validation
Every team message sent from the web frontend SHALL require at least one valid mention (`@agentName` or `@all`). Messages without mentions SHALL NOT be sendable.

#### Scenario: Send button disabled without mentions
- **WHEN** user types text in the team composer but has no mention chips
- **THEN** the send button SHALL be disabled and the mention bar SHALL show a hint

#### Scenario: Send button enabled with mention
- **WHEN** user has at least one mention chip and non-empty text
- **THEN** the send button SHALL be enabled

#### Scenario: Backend rejects mentionless team send from web
- **WHEN** a `POST /api/envelopes` request with `to: "team:<name>"` arrives with empty or missing `mentions` from a web/console origin
- **THEN** the backend SHALL reject with HTTP 400 and error message "Team messages require at least one mention"

### Requirement: Mention autocomplete
The team chat composer SHALL display an autocomplete dropdown when the user triggers mention selection.

#### Scenario: Autocomplete opens on @-button or keyboard trigger
- **WHEN** user clicks the `@` button in the composer or types `@` in the textarea
- **THEN** a dropdown SHALL appear listing all team members not already mentioned

#### Scenario: Autocomplete filters by typed characters
- **WHEN** user types `@ne` in the textarea
- **THEN** the dropdown SHALL filter to show only members whose names start with "ne" (case-insensitive)

#### Scenario: Arrow key navigation
- **WHEN** the autocomplete dropdown is visible
- **THEN** up/down arrow keys SHALL navigate the highlighted item, and Enter or Tab SHALL select it

#### Scenario: Escape dismisses autocomplete
- **WHEN** the autocomplete dropdown is visible and user presses Escape
- **THEN** the dropdown SHALL close without selecting anything

#### Scenario: @all appears in autocomplete
- **WHEN** the autocomplete dropdown is visible
- **THEN** `@all` SHALL appear as the first item in the list, visually distinguished from member names

#### Scenario: Already-mentioned members excluded
- **WHEN** `@nex` is already in the mention bar and user opens autocomplete
- **THEN** `nex` SHALL NOT appear in the autocomplete dropdown

### Requirement: Mention chips
Selected mentions SHALL render as removable chip elements in a bar above the composer textarea.

#### Scenario: Chip appears after selection
- **WHEN** user selects a member from the autocomplete dropdown
- **THEN** a chip with the member name and a remove button SHALL appear in the mention bar

#### Scenario: Chip removal
- **WHEN** user clicks the `x` button on a mention chip
- **THEN** the chip SHALL be removed and the member becomes available in autocomplete again

#### Scenario: @all chip styling
- **WHEN** `@all` is selected
- **THEN** the chip SHALL have distinct styling (e.g., different background color) to indicate broadcast

### Requirement: Team slash commands with mention targeting
The team chat composer SHALL support slash commands that target specific team members.

#### Scenario: Slash command with mention
- **WHEN** user types `/status` and has `@nex` in the mention bar
- **THEN** the system SHALL execute the `status` command against agent `nex`

#### Scenario: Slash command with multiple mentions
- **WHEN** user types `/refresh` and has `@nex` and `@walt` in the mention bar
- **THEN** the system SHALL execute `refresh` against both `nex` and `walt`

#### Scenario: Slash command with @all
- **WHEN** user types `/status` and has `@all` in the mention bar
- **THEN** the system SHALL execute `status` against all team members

#### Scenario: Available team commands
- **WHEN** user types `/` in the team chat composer
- **THEN** the command autocomplete SHALL show team-relevant commands: `/status`, `/abort`, `/refresh`, `/interrupt`
