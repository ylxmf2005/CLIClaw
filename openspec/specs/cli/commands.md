# CLI: Command Reference

Detailed flags and output for each `hiboss` command.

---

## Setup

### `hiboss setup`

Interactive bootstrap wizard. Writes `{{HIBOSS_DIR}}/settings.json` (`version: "v0.0.0"`).

Behavior:
- If already healthy, prints "Setup is already complete" and exits.
- Requires daemon downtime; fails with stop guidance if running.
- Missing `settings.json` with existing DB state → recovery mode.
- Creates two baseline agents (`primary` and `secondary`).
- Prints primary/secondary/admin tokens once.
- Prints per-user login tokens for each entered Telegram username.
- `settings.json` written with `0600` permissions (best effort).

Interactive defaults: `boss-name` (OS username), `boss-timezone` (host IANA), `primary-agent.name` (`nex`), `secondary-agent.name` (`walt`).

---

## Daemon

### `hiboss daemon start`

Startup mode: if `runtime.deployment.mode: "pm2"`, delegates to managed runtime. Otherwise starts local daemon process.

Flags: `--debug` (include debug-only fields in `daemon.log`, local mode only)

Debug-only fields: `agent-run-id`, `envelope-id`, `trigger-envelope-id`, `input-tokens`, `output-tokens`, `cache-read-tokens`, `cache-write-tokens`, `total-tokens`

Log rotation: existing non-empty `daemon.log` moved to `log_history/` with timestamp.

Startup failure output: `error:` + `log-file:` keys.

### `hiboss daemon stop`

Delegates to runtime manager if configured, otherwise SIGTERM + SIGKILL fallback.

### `hiboss daemon status`

Output (direct mode): `running:`, `start-time:`, `adapters:`, `data-dir:`

---

## Agents

### `hiboss agent register`

Flags: `--name` (required), `--provider <claude|codex>` (required), `--description`, `--workspace`, `--model`, `--reasoning-effort`, `--permission-level`, `--metadata-json`/`--metadata-file`, `--bind-adapter-type` + `--bind-adapter-token`, `--session-daily-reset-at`, `--session-idle-timeout`, `--session-max-context-length`, `--dry-run`

Defaults: `model` = provider default, `reasoning-effort` = provider default, `permission-level` = `standard`, `description` = generated default.

Output: `name:`, `description:`, `workspace:` (`(none)`), `token:` (once), `dry-run: true` (when set)

### `hiboss agent set`

Flags: `--name` (required), `--description`, `--workspace`, `--provider`, `--model`, `--reasoning-effort`, `--permission-level`, `--session-*`, `--clear-session-policy`, `--metadata-*`, `--clear-metadata`, `--bind-adapter-*`, `--unbind-adapter-type`

Notes:
- Switching providers without `--model`/`--reasoning-effort` clears both overrides.
- `--bind-adapter-*` alone replaces existing binding token (atomic replace).

Output: `success:`, `agent-name:`, `description:`, `workspace:`, `provider:`, `model:`, `reasoning-effort:`, `permission-level:`, `bindings:`, `session-*:` (optional)

### `hiboss agent delete`

Removes agent, bindings, cron schedules, home directory. Does not delete historical envelopes/runs.

Output: `success:`, `agent-name:`

### `hiboss agent list`

Output (per agent): `name:`, `workspace:` (optional), `created-at:`. Empty: `no-agents: true`

### `hiboss agent status`

Flags: `--name` (required). Agent tokens: self only.

Output: `name:`, `workspace:` (effective runtime), `provider:`, `model:`, `reasoning-effort:`, `permission-level:`, `bindings:`, `session-*:`, `agent-state:` (`running|idle`), `agent-health:` (`ok|error|unknown`), `pending-count:`, `current-run-*:` (optional), `last-run-*:` (optional)

### `hiboss agent abort`

Cancels current run + clears due pending non-cron inbox.

Output: `success:`, `agent-name:`, `cancelled-run:`, `cleared-pending-count:`

---

## Envelopes

### `hiboss envelope send`

Flags: `--to` (required), `--text`/`--text -`/`--text-file`, `--attachment` (repeatable), `--reply-to`, `--interrupt-now`, `--parse-mode`, `--deliver-at`

Notes:
- Sender identity from authenticated agent token. Admin tokens cannot send.
- Bare `agent:<name>` rejected; use `:new` or `:<chat-id>`.
- `--interrupt-now` only for single-agent destinations, mutually exclusive with `--deliver-at`.

Output: `id:` (short id). Team broadcast: multiple `id:` lines. With `--interrupt-now`: adds `interrupt-now:`, `interrupted-work:`, `priority-applied:`.

### `hiboss envelope list`

Flags: `--to`/`--from` (exactly one), `--status` (required), `--created-after`, `--created-before`, `-n/--limit` (default 10, max 50)

Notes: `--from <address> --status pending` is an ACK read (marks returned envelopes `done`).

Empty: `no-envelopes: true`

### `hiboss envelope thread`

Flags: `--envelope-id` (required)

Output: `thread-max-depth: 20`, `thread-total-count:`, `thread-returned-count:`, `thread-truncated:`, followed by envelope instruction blocks. Suppresses `in-reply-to-*` fields.

---

## Cron

### `hiboss cron create`

Flags: `--cron` (required), `--to` (required), `--timezone`, `--text`/`--text-file`, `--attachment`, `--parse-mode`, `--execution-mode` (`isolated|clone|inline`), `--isolated`/`--clone`/`--inline` (shorthands)

Notes:
- `--to` supports `agent:<name>` and `channel:<adapter>:<chat-id>`.
- `--to team:*` and `--to agent:<name>:new|<chat-id>` are rejected for cron schedules.
- `--parse-mode` is valid only for channel destinations.
- Only one of `--execution-mode`, `--isolated`, `--clone`, `--inline` should be set; default is `isolated`.

Output: `cron-id:` (short id)

### `hiboss cron explain`

Flags: `--cron` (required), `--timezone`, `--count` (default 5, max 20)

Output: `cron:`, `timezone:`, `count:`, `evaluated-at:`, `next-run-1:` ... `next-run-N:`

### `hiboss cron list`

Output (per schedule): canonical cron output keys (see `openspec/specs/core/definitions.md`). Empty: `no-crons: true`

### `hiboss cron enable/disable/delete`

Flags: `--id` (required). Output: `success:`, `cron-id:`. Ambiguous prefix: error with candidates.

---

## Reactions

### `hiboss reaction set`

Flags: `--envelope-id` (required), `--emoji` (required)

Output: `success: true|false`

---

## Teams

### `hiboss team register`

Flags: `--name` (required), `--description`

Output: `success:`, `team-name:`, `team-status:`, `team-kind:`, `description:`, `created-at:`, `members:`

### `hiboss team set`

Flags: `--name`, `--description`, `--clear-description`, `--status <active|archived>`

Output: same shape as register

### `hiboss team add-member` / `remove-member`

Flags: `--name`, `--agent`. Output: `success:`, `team-name:`, `agent-name:`

### `hiboss team status`

Output: `team-name:`, `team-status:`, `team-kind:`, `description:`, `created-at:`, `members:`

### `hiboss team list-members`

Output: `team-name:`, `member-count:`, per-member: `agent-name:`, `source:`, `joined-at:`. Empty: `no-members: true`

### `hiboss team send`

Flags: `--name`, `--text`/`--text-file`, `--attachment`, `--deliver-at`, `--interrupt-now`, `--reply-to`

Output: `team-name:`, `requested-count:`, `sent-count:`, `failed-count:`, per-recipient: `agent-name:`, `status:`, `id:`, `error:`. No recipients: `no-recipients: true`

Exit behavior:
- Exits non-zero when `failed-count > 0` (partial delivery still prints per-recipient results).

### `hiboss team list`

Flags: `--status` (optional filter). Empty: `no-teams: true`. Blocks: `team-name:`, `team-status:`, `team-kind:`, `description:`, `created-at:`, `members:`

### `hiboss team delete`

Output: `success:`, `team-name:`
