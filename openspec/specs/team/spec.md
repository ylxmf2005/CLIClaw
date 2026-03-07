# Teams

A team groups agents and provides a shared teamspace directory for collaboration context.

## Storage

Tables: `teams`, `team_members` (see `src/daemon/db/schema.ts`).

Field mappings: `openspec/specs/core/definitions.md`.

## Teamspace Layout

- Teamspaces are sibling to `agents/`: `{{CLICLAW_DIR}}/teamspaces/<team-name>/`
- Team register initializes teamspace directory.
- Team delete removes teamspace directory.
- Team archive does not remove the directory.

When an agent belongs to at least one active team, the primary active team's teamspace is used as the effective runtime workspace for provider sessions. Provider workspace config (e.g. `.claude/`) can live inside the teamspace.

## Team Messaging

`cliclaw team send` fans out one envelope per team member (sender excluded). Each envelope targets `agent:<member>` and stamps `metadata.chatScope = team:<name>`.

- `cliclaw team send --name <team>` → broadcast fan-out (all members excluding sender)
- `cliclaw team send --interrupt-now` is supported (applied per recipient); mutually exclusive with `--deliver-at`
- `cliclaw envelope send --to team:<name>` → broadcast fan-out in team chat scope (does not support `--interrupt-now`)
- `cliclaw envelope send --to team:<name>:<agent>` → single target in team chat scope (supports `--interrupt-now`)
- Archived teams reject `team send`
- Best-effort fan-out: one failure does not abort remaining sends

## CLI

Detailed command flags and output: `openspec/specs/cli/commands.md`.

Commands: `cliclaw team register`, `team set`, `team add-member`, `team remove-member`, `team status`, `team list`, `team list-members`, `team send`, `team delete`.

## CLI Output Keys

- `team register/set/status/list`: `team-name:`, `team-status:`, `team-kind:`, `description:`, `created-at:`, `members:`
- `team add-member/remove-member`: `success:`, `team-name:`, `agent-name:`
- `team list-members`: `team-name:`, `member-count:`, per-member: `agent-name:`, `source:`, `joined-at:`
- `team send`: `team-name:`, `requested-count:`, `sent-count:`, `failed-count:`, per-recipient: `agent-name:`, `status:`, `id:`, `error:`
- `team delete`: `success:`, `team-name:`
