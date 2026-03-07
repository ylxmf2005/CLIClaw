# CLI: Surface, Conventions & IPC

## CLI Conventions

### Token Resolution

- Most commands accept `--token`. If omitted, uses `CLICLAW_TOKEN`.
- Admin-token access is operation-specific. Some envelope operations are allowed for admin tokens with stricter constraints (for example admin `envelope.send` only allows agent destinations).

### Clearing Nullable Overrides

Some agent settings are nullable (e.g., `model`, `reasoning-effort`). To clear via CLI, use sentinel `default`:
- `cliclaw agent set --name <agent> --model default`
- `cliclaw agent set --name <agent> --reasoning-effort default`

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
| `cliclaw setup` | Interactive bootstrap | No | n/a |
| `cliclaw daemon start` | Start daemon | Admin | admin |
| `cliclaw daemon stop` | Stop daemon | Admin | admin |
| `cliclaw daemon status` | Daemon status | Admin | admin |
| `cliclaw envelope send` | Send envelope | Agent/Admin (restricted for admin) | restricted |
| `cliclaw envelope list` | List envelopes | Agent/Admin (restricted for admin) | restricted |
| `cliclaw envelope thread` | Show thread | Agent/Admin | restricted |
| `cliclaw cron create` | Create cron | Agent | restricted |
| `cliclaw cron explain` | Preview cron | Optional | n/a |
| `cliclaw cron list` | List cron | Agent/Admin | restricted |
| `cliclaw cron enable/disable/delete` | Manage cron | Agent | restricted |
| `cliclaw reaction set` | Set reaction | Agent | restricted |
| `cliclaw agent register` | Register agent | Admin | admin |
| `cliclaw agent set` | Update agent | Agent/Admin | privileged |
| `cliclaw agent list` | List agents | Agent/Admin | restricted |
| `cliclaw agent status` | Agent state | Agent/Admin | restricted |
| `cliclaw agent abort` | Cancel run + clear inbox | Admin | admin |
| `cliclaw agent delete` | Delete agent | Admin | admin |
| `cliclaw team register` | Create team | Agent/Admin | privileged |
| `cliclaw team set` | Update team | Agent/Admin | privileged |
| `cliclaw team add-member` | Add to team | Agent/Admin | privileged |
| `cliclaw team remove-member` | Remove from team | Agent/Admin | privileged |
| `cliclaw team status` | Team details | Agent/Admin | restricted |
| `cliclaw team list` | List teams | Agent/Admin | restricted |
| `cliclaw team list-members` | List members | Agent/Admin | restricted |
| `cliclaw team send` | Fan-out message | Agent | restricted |
| `cliclaw team delete` | Delete team | Admin | admin |

---

## IPC (CLI ↔ daemon)

### Transport

- Socket path: `~/cliclaw/.daemon/daemon.sock` (or `{{CLICLAW_DIR}}/.daemon/daemon.sock`)
- Protocol: JSON-RPC 2.0

Key files: `src/daemon/ipc/server.ts`, `src/cli/ipc-client.ts`, `src/daemon/ipc/types.ts`, `src/daemon/daemon.ts`

### Authentication

Most RPC methods require a **token** (agent or admin):
- CLI passes `token` in params (or uses `CLICLAW_TOKEN`)
- Daemon resolves as **admin token** (matches `tokens[].role = admin`) or **agent token** (matches `agents.token`)

Bootstrap methods (no token): `setup.check`, `admin.verify`

### RPC Methods

**Envelope:** `envelope.send`, `envelope.list`, `envelope.thread`, `envelope.conversations`

`envelope.send` notable params:
- `interruptNow?: boolean` (single-agent only; mutually exclusive with `deliverAt`)
- `parseMode?: "plain" | "markdownv2" | "html"` (channel only)
- `replyToEnvelopeId?: string`
- `origin?: "cli" | "internal"`
- admin-specific rule: destination must be `agent:<name>:new` or `agent:<name>:<chat-id>`

`envelope.list` admin note:
- admin requests must provide `to` (not `from`)
- admin list is read-only (no pending ACK side effect)

**Reactions:** `reaction.set`

**Cron:** `cron.create`, `cron.list`, `cron.enable`, `cron.disable`, `cron.delete`

**Agents:** `agent.register`, `agent.set`, `agent.list`, `agent.delete`, `agent.bind`, `agent.unbind`, `agent.refresh`, `agent.abort`, `agent.self`, `agent.session-policy.set`, `agent.status`

**Teams:** `team.register`, `team.set`, `team.add-member`, `team.remove-member`, `team.status`, `team.list`, `team.list-members`, `team.send`, `team.delete`

**Daemon:** `daemon.status`, `daemon.ping`, `daemon.time`

**Sessions / Chat State:** `session.list`, `chat.relay-toggle`

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
