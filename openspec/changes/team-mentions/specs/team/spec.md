## MODIFIED Requirements

### Requirement: Team Messaging
`hiboss team send` fans out one envelope per team member (sender excluded). Each envelope targets `agent:<member>` and stamps `metadata.chatScope = team:<name>`.

- `hiboss team send --name <team>` → broadcast fan-out (all members excluding sender)
- `hiboss team send --interrupt-now` is supported (applied per recipient); mutually exclusive with `--deliver-at`
- `hiboss envelope send --to team:<name>` → broadcast fan-out in team chat scope (does not support `--interrupt-now`)
- `hiboss envelope send --to team:<name>:<agent>` → single target in team chat scope (supports `--interrupt-now`)
- Archived teams reject `team send`
- Best-effort fan-out: one failure does not abort remaining sends

When the `mentions` parameter is provided via RPC/API (not CLI):
- `mentions: ["@all"]` → broadcast fan-out (same as no-mentions behavior)
- `mentions: ["agent1", "agent2"]` → targeted fan-out to listed members only
- Each mentioned name SHALL be validated as an active team member
- Web/console-origin team sends SHALL require non-empty `mentions`; CLI and agent-origin sends do not require it

#### Scenario: Web-origin team send requires mentions
- **WHEN** a web-origin `envelope.send` with `to: "team:core-dev"` arrives without `mentions`
- **THEN** the backend SHALL reject with error "Team messages require at least one mention"

#### Scenario: CLI team send does not require mentions
- **WHEN** `hiboss team send --name core-dev --text "hello"` is called
- **THEN** the send SHALL proceed as broadcast (backward compatible)

#### Scenario: Agent-origin team send does not require mentions
- **WHEN** an agent calls `envelope.send` with `to: "team:core-dev"` without `mentions`
- **THEN** the send SHALL proceed as broadcast (backward compatible)

#### Scenario: Targeted fan-out with mentions
- **WHEN** `envelope.send` is called with `to: "team:core-dev"`, `mentions: ["nex", "walt"]`
- **THEN** envelopes SHALL be created only for `nex` and `walt`, not other team members

#### Scenario: Invalid mention rejected
- **WHEN** `mentions: ["nex", "nonexistent"]` is provided for team `core-dev`
- **THEN** the backend SHALL reject with an error listing `nonexistent` as invalid
