## MODIFIED Requirements

### Requirement: Demo composer is interactive
The demo chat and team chat composers SHALL use a real `<textarea>` element (not a static `<div>` placeholder) with:
- Auto-resize up to 160px max height
- `Enter` key sends the message (dispatches `ADD_ENVELOPE` to demo reducer)
- `Shift+Enter` inserts a newline
- Placeholder text matches the context (agent name or team name)
- Visual feedback: border color changes when text is present

Sent messages SHALL appear immediately in the message list as "boss" envelopes (`fromBoss: true`).

#### Scenario: User types and sends in demo chat
- **WHEN** user types text in the demo chat composer and presses Enter
- **THEN** a new envelope SHALL appear in the message list with `fromBoss: true` and the typed text

#### Scenario: Shift+Enter inserts newline
- **WHEN** user presses Shift+Enter in the composer
- **THEN** a newline SHALL be inserted without sending the message

#### Scenario: Composer auto-resizes
- **WHEN** user types multiple lines in the composer
- **THEN** the textarea SHALL grow in height up to 160px, then show a scrollbar

### Requirement: Consistent scrollbar visibility
All scrollable containers SHALL have visible, styled scrollbars that match the application theme. This includes:
- Message lists (chat and team views)
- Left panel (chat list, agent list, team list)
- Member panels
- Terminal output areas

Firefox SHALL use `scrollbar-width: thin` and `scrollbar-color` properties. WebKit SHALL use existing `::-webkit-scrollbar` styles.

#### Scenario: Message list scrollbar is visible
- **WHEN** the message list overflows its container
- **THEN** a thin styled scrollbar SHALL be visible on the right side

#### Scenario: Left panel scrollbar is visible
- **WHEN** the chat list in the left panel overflows
- **THEN** a thin styled scrollbar SHALL be visible

### Requirement: Demo reducer supports ADD_ENVELOPE action
The demo reducer SHALL support an `ADD_ENVELOPE` action that:
- Creates a new envelope with a generated ID, `fromBoss: true`, current timestamp
- Appends it to the appropriate envelope list (keyed by agent chat or team)
- Updates the conversation's `lastMessage` and `lastMessageAt`

#### Scenario: ADD_ENVELOPE for agent chat
- **WHEN** `ADD_ENVELOPE` is dispatched with `to: "agent:nex"`, `chatId: "pr-review"`, `text: "Hello"`
- **THEN** a new envelope SHALL be appended to `envelopes["agent:nex:pr-review"]` with `from: "channel:web:boss"`, `fromBoss: true`

#### Scenario: ADD_ENVELOPE for team chat
- **WHEN** `ADD_ENVELOPE` is dispatched with `to: "team:core-dev"`, `text: "Hello team"`
- **THEN** a new envelope SHALL be appended to `envelopes["team:core-dev"]` with `from: "channel:web:boss"`, `fromBoss: true`
