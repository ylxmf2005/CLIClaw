## ADDED Requirements

### Requirement: Agent detail sheet
The web frontend SHALL provide an agent detail view as a slide-out sheet (from the right) accessible from the agent card in the sidebar or from the chat header. The detail sheet SHALL display: agent name, description, provider, model, reasoning effort, permission level, workspace, session policy, bindings, relay mode default, creation date, and last seen date.

#### Scenario: Open agent detail from agent card
- **WHEN** the user long-presses or clicks an info action on an agent card in the sidebar
- **THEN** a sheet SHALL slide open from the right showing the agent's full details

#### Scenario: Open agent detail from chat header
- **WHEN** the user clicks the agent info/settings button in the chat header
- **THEN** a sheet SHALL slide open from the right showing the agent's full details

### Requirement: Agent edit form
The agent detail sheet SHALL include an edit form allowing the user to modify: description, workspace, provider, model, reasoning effort, permission level, and relay mode default. Changes SHALL be submitted via `PATCH /api/agents/:name`.

#### Scenario: Edit agent description
- **WHEN** the user changes the description field and saves
- **THEN** the frontend SHALL call `PATCH /api/agents/:name` with the new description and update the local state on success

#### Scenario: Edit agent provider
- **WHEN** the user changes the provider from claude to codex and saves
- **THEN** the frontend SHALL call `PATCH /api/agents/:name` with `{ provider: "codex" }` and update the agent in state

#### Scenario: Clear optional field
- **WHEN** the user clears the model field and saves
- **THEN** the frontend SHALL send `{ model: null }` to clear the override

#### Scenario: Set relay mode default
- **WHEN** the user sets relay mode to "default-on" in the agent detail sheet
- **THEN** new chats with this agent SHALL start with relay mode enabled by default

### Requirement: Agent delete flow
The agent detail sheet SHALL include a delete button. Clicking delete SHALL show a confirmation dialog. On confirmation, the frontend SHALL call `DELETE /api/agents/:name`, remove the agent from local state, and close the sheet.

#### Scenario: Delete agent with confirmation
- **WHEN** the user clicks "Delete Agent" and confirms in the dialog
- **THEN** the frontend SHALL call `DELETE /api/agents/:name`, remove the agent from state, show a success toast, and navigate away from the agent's chat if it was selected

#### Scenario: Cancel delete
- **WHEN** the user clicks "Delete Agent" but cancels the confirmation dialog
- **THEN** no API call SHALL be made and the sheet remains open

### Requirement: Agent binding management
The agent detail sheet SHALL show current adapter bindings and allow adding/removing bindings. Adding a Telegram binding requires the bot token input.

#### Scenario: View current bindings
- **WHEN** the agent detail sheet is open for an agent with a Telegram binding
- **THEN** the sheet SHALL display "telegram" as an active binding with a remove button

#### Scenario: Add Telegram binding
- **WHEN** the user clicks "Add Binding", selects "telegram", enters a bot token, and confirms
- **THEN** the frontend SHALL call the bind endpoint and update the agent's bindings in state

#### Scenario: Remove binding
- **WHEN** the user clicks the remove button next to a binding and confirms
- **THEN** the frontend SHALL call the unbind endpoint and update the agent's bindings in state

### Requirement: Agent create modal uses real API
The existing `AgentCreateModal` SHALL call `POST /api/agents` to register agents on the real daemon. On success, it SHALL display the one-time token and add the agent to local state via the `agent.registered` WebSocket event or direct state update.

#### Scenario: Register agent successfully
- **WHEN** the user fills in the create form and submits
- **THEN** the frontend SHALL call `POST /api/agents` with the form data, display the returned token, and the new agent SHALL appear in the agent list

#### Scenario: Registration error
- **WHEN** the registration fails (e.g., duplicate name)
- **THEN** the frontend SHALL display the error message from the API response
