## ADDED Requirements

### Requirement: Mentions field on envelope send
The `envelope.send` RPC and `POST /api/envelopes` endpoint SHALL accept an optional `mentions: string[]` field for team-scoped envelope sends.

#### Scenario: Team send with mentions array
- **WHEN** `POST /api/envelopes` is called with `to: "team:core-dev"` and `mentions: ["nex", "walt"]`
- **THEN** envelopes SHALL be created only for agents `nex` and `walt` (not all team members)

#### Scenario: Team send with @all mention
- **WHEN** `POST /api/envelopes` is called with `to: "team:core-dev"` and `mentions: ["@all"]`
- **THEN** envelopes SHALL be created for all team members (same as current broadcast behavior)

#### Scenario: Mentions validated against team membership
- **WHEN** `mentions: ["nex", "nonexistent"]` is provided for team `core-dev`
- **THEN** the backend SHALL reject with HTTP 400 listing the invalid member name(s)

#### Scenario: Mentions ignored for non-team destinations
- **WHEN** `mentions` is provided but `to` is not a team address (e.g., `agent:nex:new`)
- **THEN** the `mentions` field SHALL be silently ignored

## MODIFIED Requirements

### Requirement: Team fan-out routing
`hiboss envelope send --to team:<name>` fans out one envelope per team member (sender excluded). Each envelope targets `agent:<member>` and stamps `metadata.chatScope = team:<name>`.

When a `mentions` array is provided (via RPC/API):
- `["@all"]` → broadcast fan-out to all members excluding sender (existing behavior)
- `["agent1", "agent2", ...]` → fan-out only to listed members, each stamped with `metadata.chatScope = team:<name>` and `metadata.mentions` recording the original mentions array

CLI `team send` and `envelope send --to team:<name>` without `mentions` continue to broadcast to all members (backward compatible).

#### Scenario: CLI team send broadcasts without mentions
- **WHEN** `hiboss team send --name core-dev --text "hello"` is called (no mentions parameter)
- **THEN** envelopes SHALL be created for all team members excluding sender (existing behavior preserved)

#### Scenario: API team send with targeted mentions
- **WHEN** API call includes `to: "team:core-dev"`, `mentions: ["nex"]`, `text: "review this"`
- **THEN** exactly one envelope SHALL be created targeting `agent:nex` with `metadata.chatScope = "team:core-dev"` and `metadata.mentions = ["nex"]`

#### Scenario: Mentions metadata recorded on envelope
- **WHEN** a team envelope is created with `mentions: ["nex", "walt"]`
- **THEN** each resulting envelope SHALL have `metadata.mentions = ["nex", "walt"]` for audit/display purposes
