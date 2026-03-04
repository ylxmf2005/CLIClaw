# CLI: Surface, Conventions & IPC

## CLI Conventions

### Token Resolution

- Most commands accept `--token`. If omitted, uses `HIBOSS_TOKEN`.
- Admin tokens cannot perform agent-token operations like `hiboss envelope send` / `hiboss envelope list` / `hiboss envelope thread`.

### Clearing Nullable Overrides

Some agent settings are nullable (e.g., `model`, `reasoning-effort`). To clear via CLI, use sentinel `default`:
- `hiboss agent set --name <agent> --model default`
- `hiboss agent set --name <agent> --reasoning-effort default`

### Output Stability

- Operational commands print parseable `key: value` lines with kebab-case keys.
- Envelope instruction keys: see `openspec/specs/core/definitions.md`.

### IDs (short ids + prefix input)

- UUID-backed IDs printed as short IDs by default (see `openspec/specs/core/spec.md`).
- `--id` accepts: short id, longer prefix, or full UUID (hyphens optional).
- Ambiguous prefix: exits non-zero with `error: ambiguous-id-prefix` + `candidate-*` lines.

### Provider Homes

Provider-home behavior is canonical in `openspec/specs/agent/spec.md`. Summary:
- Shared default homes: Claude `~/.claude`, Codex `~/.codex`.
- Optional per-agent env overrides via `agent.metadata.providerCli.<provider>.env`.

---

## Command Summary

Default permission levels come from `DEFAULT_PERMISSION_POLICY`.

| Command | Purpose | Token | Default Permission |
|---------|---------|-------|--------------------|
| `hiboss setup` | Interactive bootstrap | No | n/a |
| `hiboss daemon start` | Start daemon | Admin | admin |
| `hiboss daemon stop` | Stop daemon | Admin | admin |
| `hiboss daemon status` | Daemon status | Admin | admin |
| `hiboss envelope send` | Send envelope | Agent | restricted |
| `hiboss envelope list` | List envelopes | Agent | restricted |
| `hiboss envelope thread` | Show thread | Agent | restricted |
| `hiboss cron create` | Create cron | Agent | restricted |
| `hiboss cron explain` | Preview cron | Optional | n/a |
| `hiboss cron list` | List cron | Agent | restricted |
| `hiboss cron enable/disable/delete` | Manage cron | Agent | restricted |
| `hiboss reaction set` | Set reaction | Agent | restricted |
| `hiboss agent register` | Register agent | Admin | admin |
| `hiboss agent set` | Update agent | Agent/Admin | privileged |
| `hiboss agent list` | List agents | Agent/Admin | restricted |
| `hiboss agent status` | Agent state | Agent/Admin | restricted |
| `hiboss agent abort` | Cancel run + clear inbox | Admin | admin |
| `hiboss agent delete` | Delete agent | Admin | admin |
| `hiboss team register` | Create team | Agent/Admin | privileged |
| `hiboss team set` | Update team | Agent/Admin | privileged |
| `hiboss team add-member` | Add to team | Agent/Admin | privileged |
| `hiboss team remove-member` | Remove from team | Agent/Admin | privileged |
| `hiboss team status` | Team details | Agent/Admin | restricted |
| `hiboss team list` | List teams | Agent/Admin | restricted |
| `hiboss team list-members` | List members | Agent/Admin | restricted |
| `hiboss team send` | Fan-out message | Agent | restricted |
| `hiboss team delete` | Delete team | Admin | admin |

---

## IPC (CLI ↔ daemon)

### Transport

- Socket path: `~/hiboss/.daemon/daemon.sock` (or `{{HIBOSS_DIR}}/.daemon/daemon.sock`)
- Protocol: JSON-RPC 2.0

Key files: `src/daemon/ipc/server.ts`, `src/cli/ipc-client.ts`, `src/daemon/ipc/types.ts`, `src/daemon/daemon.ts`

### Authentication

Most RPC methods require a **token** (agent or admin):
- CLI passes `token` in params (or uses `HIBOSS_TOKEN`)
- Daemon resolves as **admin token** (matches `tokens[].role = admin`) or **agent token** (matches `agents.token`)

Bootstrap methods (no token): `setup.check`, `admin.verify`

### RPC Methods

**Envelope:** `envelope.send`, `envelope.list`, `envelope.thread`

`envelope.send` notable params:
- `interruptNow?: boolean` (agent only; mutually exclusive with `deliverAt`)
- `parseMode?: "plain" | "markdownv2" | "html"` (channel only)
- `replyToEnvelopeId?: string`
- `origin?: "cli" | "internal"`

**Reactions:** `reaction.set`

**Cron:** `cron.create`, `cron.list`, `cron.enable`, `cron.disable`, `cron.delete`

**Agents:** `agent.register`, `agent.set`, `agent.list`, `agent.delete`, `agent.bind`, `agent.unbind`, `agent.refresh`, `agent.abort`, `agent.self`, `agent.session-policy.set`, `agent.status`

**Teams:** `team.register`, `team.set`, `team.add-member`, `team.remove-member`, `team.status`, `team.list`, `team.list-members`, `team.send`, `team.delete`

**Daemon:** `daemon.status`, `daemon.ping`, `daemon.time`

**Setup:** `setup.check`

**Admin:** `admin.verify`

---

## CLI Output Keys (summary)

Detailed output keys for each command are in `openspec/specs/cli/commands.md` and `openspec/specs/core/definitions.md`.

## Key Files

| Component | File |
|-----------|------|
| CLI surface | `src/cli/cli.ts` |
| RPC calls + printing | `src/cli/commands/*.ts` |
| Envelope rendering | `src/cli/instructions/format-envelope.ts` |
| Prompt system | `src/shared/prompt-renderer.ts`, `src/shared/prompt-context.ts` |
| Templates | `prompts/` |
