# Configuration

## Sources

Hi-Boss configuration comes from:

1. CLI flags (`hiboss ... --flag`)
2. Environment variables (`HIBOSS_TOKEN`, `HIBOSS_DIR`, …)
3. `settings.json` (`{{HIBOSS_DIR}}/settings.json`, source-of-truth)
4. SQLite runtime cache (`{{HIBOSS_DIR}}/.daemon/hiboss.db`)

Built-in defaults: `src/shared/defaults.ts`

---

## Environment Variables

### `HIBOSS_TOKEN`

Default token for CLI commands when `--token` is omitted. Used by most daemon-talking commands.

### `HIBOSS_DIR`

Overrides root directory (default: `~/hiboss`). Must be absolute or start with `~`. Internal state under `{{HIBOSS_DIR}}/.daemon/`.

### `HIBOSS_UI_LOCALE`

UI/system-message locale for fixed non-AI text. Supported: `en` (default), `zh-CN` (also accepts `zh` / `zh_cn` / `en-us`).

Scope: Telegram slash-command descriptions and fixed system messages. Overrides `config.ui_locale` when present. Parseable CLI output keys remain stable English kebab-case.
`config.ui_locale` is a legacy/optional runtime cache key (not sourced from `settings.json` in current flow). If neither env nor that key is set, locale falls back to `en`.

### Provider CLI Homes

Hi-Boss first clears `CLAUDE_CONFIG_DIR` and `CODEX_HOME` when spawning provider processes, then applies per-agent `metadata.providerCli.<provider>.env` overrides if set.

---

## Data Directory Layout

Default root: `~/hiboss/` (override via `HIBOSS_DIR`)

Operator-visible files:
- `{{HIBOSS_DIR}}/media/` — downloaded attachments
- `{{HIBOSS_DIR}}/teamspaces/<team-name>/` — shared team workspace
- `{{HIBOSS_DIR}}/agents/<agent-name>/internal_space/MEMORY.md` — per-agent memory
- `{{HIBOSS_DIR}}/agents/<agent-name>/internal_space/memories/` — daily memory files
- `{{HIBOSS_DIR}}/agents/<agent-name>/internal_space/history/` — session history

Internal daemon files (do not touch):
- `{{HIBOSS_DIR}}/.daemon/hiboss.db` — SQLite DB
- `{{HIBOSS_DIR}}/.daemon/daemon.sock` — IPC socket
- `{{HIBOSS_DIR}}/.daemon/daemon.lock` — single-instance lock
- `{{HIBOSS_DIR}}/.daemon/daemon.pid` — PID
- `{{HIBOSS_DIR}}/.daemon/daemon.log` — current daemon log
- `{{HIBOSS_DIR}}/.daemon/log_history/` — archived daemon logs

Note: no `--data-dir` flag; use `HIBOSS_DIR`. Provider CLI homes (`~/.claude`, `~/.codex`) are not part of the data directory.

---

## Settings Source of Truth

`settings.json` is canonical. Operators can edit it directly and restart daemon. SQLite is a runtime cache.

### `settings.json` Schema

Top-level required: `version: "v0.0.0"`, `timezone`, `permission-policy`, `tokens[]`, `agents[]`

Top-level optional: `runtime`, `providerCli` (also accepts `provider-cli`)

Key fields:
- `timezone` — valid IANA timezone for displayed timestamps
- `permission-policy` — operation → permission-level map
- `tokens[]` — each: `name`, `token` (32 hex), `role` (`admin`/`user`), optional `agents[]`, optional `bindings[]`
- `agents[].relay-mode` (optional) — `default-on` or `default-off` (default `default-off`)
- `runtime.session-concurrency.per-agent` (default `4`)
- `runtime.session-concurrency.global` (default `16`, must be `>= per-agent`)
- `runtime.session-summary.recent-days` (default `3`)
- `runtime.session-summary.per-session-max-chars` (default `24000`)
- `runtime.session-summary.max-retries` (default `3`)
- `runtime.telegram.command-reply-auto-delete-seconds` (default `30`; `0` disables)
- `runtime.telegram.inbound-interrupt-window-seconds` (default `3`; `0` disables auto interrupt-now for rapid follow-up inbound messages)
- `runtime.deployment.mode` (optional; currently only `pm2`)
- `runtime.deployment.output-dir` (required when mode is set)

Invariants: non-empty agent array, unique agent names (case-insensitive), unique tokens, unique adapter identities.

### Persistence

On daemon startup: read + validate `settings.json`, mirror runtime-needed fields into SQLite cache, mark `config.setup_completed = "true"`.
`runtime.deployment.*` remains settings-file-only and is read directly by CLI managed-runtime actions.

---

## Permission Policy

Stored at `settings.json["permission-policy"]`, mirrored to `config.permission_policy`.

Levels: `restricted < standard < privileged < admin`. Missing operations default to `admin`.

Default policy: see `openspec/specs/cli/spec.md` command table for per-command defaults.

## Channel User Token Policy

Stored at `settings.json.tokens[]`, mirrored to `config.user_permission_policy`.

Token-centric: `role: admin` → all agents, `role: user` → `agents[]` scoped. Platform identity authenticated via `/login <token>` and persisted in `channel_user_auth`.

---

## SQLite State

DB: `{{HIBOSS_DIR}}/.daemon/hiboss.db`. Schema source: `src/daemon/db/schema.ts`.

Tables: `config`, `agents`, `teams`, `team_members`, `agent_bindings`, `envelopes`, `cron_schedules`, `agent_runs`, `agent_sessions`, `channel_session_bindings`, `channel_session_links`, `channel_user_auth`, `chat_state`

### `config` keys (selected)

- `setup_completed`, `boss_name`, `boss_timezone`, `permission_policy`, `user_permission_policy`
- `ui_locale` (optional legacy/manual key; env `HIBOSS_UI_LOCALE` takes precedence)
- `runtime_session_concurrency_per_agent`, `runtime_session_concurrency_global`
- `runtime_session_summary_recent_days`, `runtime_session_summary_per_session_max_chars`, `runtime_session_summary_max_retries`
- `runtime_telegram_command_reply_auto_delete_seconds`
- `runtime_telegram_inbound_interrupt_window_seconds`

### Key Invariants

- Envelopes are durable; routing/scheduling operates by querying `envelopes`.
- Agent tokens and adapter tokens stored plaintext; protect `{{HIBOSS_DIR}}/`.
