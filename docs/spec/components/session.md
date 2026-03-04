# Session Management

This document describes how Hi-Boss manages agent sessions.

## Overview

Hi-Boss sessions are **always chat-scoped**:

- `channel:*` envelopes use per-chat mapping (`agent + adapter + chat-id -> session`)
- agent-origin envelopes with `metadata.chatScope` use the same mapping with `adapter_type="internal"` and `chat_id=chatScope`
- agent-origin envelopes without `chatScope` are mapped to synthesized internal chat ids (for example `cron:<schedule-id>` or `internal:<from>:to:<target>`)
- multiple chats can intentionally point to the same session id

Session IDs are UUID-backed internally and shown as short IDs in operator-facing surfaces.

## Session Lifecycle

### Creation

Sessions are created on-demand when an agent processes due envelopes:

1. The executor reads due envelopes for an agent.
2. Envelopes are grouped by target session scope.
3. For `channel:*` envelopes, Hi-Boss resolves/creates session mapping via `channel_session_bindings`.
4. For agent-origin envelopes with `chatScope`, Hi-Boss resolves/creates internal channel mappings via `channel_session_bindings` (`adapter_type="internal"`).
5. For agent-origin envelopes without `chatScope`, Hi-Boss synthesizes a deterministic internal chat id and resolves/creates its mapping.
6. A runtime session object is loaded or created and reused for that scope.
7. Provider session/thread id is updated from CLI output after each successful run.

### Reuse

- Reuse is scope-local: same scope reuses the same runtime session object.
- Different scopes can run concurrently.
- If two chats are mapped to the same session id, they share context and execute serially.

### Refresh

Sessions are refreshed when:

| Trigger | Description |
|---------|-------------|
| `dailyResetAt` | Configured time of day |
| `idleTimeout` | No activity for configured duration |
| `maxContextLength` | Context-length threshold exceeded |
| Manual `/new` | Creates and switches current chat to a fresh session |
| Manual `/session <id>` | Switches current chat to a selected visible session |
| Manual `/provider <claude|codex> [...]` | Switches agent provider, optionally sets model/reasoning overrides, and requests agent-wide session refresh when values change |
| Daemon restart | Runtime cache is rebuilt from DB state |

Scope semantics:
- Policy refreshes (`dailyResetAt`, `idleTimeout`, `maxContextLength`) are scope-local.
  - Scope refresh only clears that scope's provider handle/cache.
- Agent-wide refreshes (clear all scopes for an agent) are explicit/manual (`/provider`, RPC `agent.refresh`, delete, etc.).

### Session Close

When Hi-Boss closes the current runtime session (manual `/new`, policy refresh, or daemon shutdown), it:

- compact-writes session events from append-only journal (`*.events.ndjson`) into the JSON history file and marks `endedAtMs`
- writes/updates the markdown companion in one write, including `ended-at` and `summary-status: pending`
- does not run a background summary worker

During active sessions, Hi-Boss also performs opportunistic journal compaction into `.json` on threshold/interval triggers to bound recovery work and file growth.

## Storage

### In-memory (runtime)

`src/agent/executor.ts` keeps:

- channel session cache (session-id keyed)
- per-session serialization locks
- global/per-agent concurrency semaphores
- active session history fallback buffers (used only when journal append fails)

### SQLite (durable)

Core session tables:

- `agent_sessions`
  - session registry (`provider`, `provider_session_id`, `last_active_at`)
- `channel_session_bindings`
  - current mapped session id per `(agent_name, adapter_type, chat_id)`
- `channel_session_links`
  - visibility/history links for listing/filtering session scopes

Per-agent session history files:

- path: `agents/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<session-id>.json`
- schema version: `"v0.0.0"`
- payload model: compacted `events[]` (envelope lifecycle), not chat-turn transcripts
  - `envelope-created` (full envelope snapshot + origin)
  - `envelope-status-changed` (`fromStatus`, `toStatus`, `reason`, `outcome`, `origin`)
- append-only journal: `agents/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<session-id>.events.ndjson`
  - write model: one JSON event per line (best-effort immediate append)
  - close behavior: journal is compacted into `.json`, then cleared
- markdown companion: `agents/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<session-id>.md`
  - body model: real conversation records (`from`, `to`, `content`)
  - frontmatter model: `summary`, `summary-status`, retry/error metadata

## Session Listing / Switching (Telegram)

Boss-only commands:

- `/sessions`
  - 3 tabs: `current-chat`, `my-chats`, `agent-all`
  - pagination: 10 per page, up to 100 sessions
  - sorted by `last-active-at` desc
  - supports inline keyboard tab + pager callbacks
- `/session <session-id>`
  - accepts short id / prefix / full UUID
  - switches current chat binding to target session if visible
- `/new`
  - switches current chat to a new fresh session and returns old/new ids
- `/trace`
  - shows the current run trace snapshot (current running run if any; otherwise last finished run)
  - no run-id argument
  - when run is still in progress, returns partial live entries when available
  - returns structured trace entries for Claude and Codex runs
- `/provider <claude|codex> [model=<name|default>] [reasoning-effort=<none|low|medium|high|xhigh|default>]`
  - switches the bound agent provider
  - when provided, updates model/reasoning-effort overrides
  - on provider change without explicit overrides, resets model/reasoning-effort to provider defaults
  - requests agent-wide session refresh when provider/model/reasoning changed (all scopes/chats)

## Concurrency

Execution model:

- **Across sessions:** parallel (bounded)
- **Within one session:** strictly serial (ordering preserved)

Default limits (configurable via settings runtime block):

- per-agent: `4`
- global: `16`

Config keys mirrored into SQLite config cache:

- `runtime_session_concurrency_per_agent`
- `runtime_session_concurrency_global`
- `runtime_session_summary_recent_days`
- `runtime_session_summary_per_session_max_chars`
- `runtime_session_summary_max_retries`
- `runtime_telegram_command_reply_auto_delete_seconds`

## Key Files

| File | Purpose |
|------|---------|
| `src/agent/executor.ts` | Session scope resolution, execution scheduling, concurrency limits |
| `src/daemon/db/database.ts` | Session registry/binding/link persistence |
| `src/daemon/channel-commands.ts` | `/new`, `/sessions`, `/session`, `/trace`, `/provider` behavior |
| `src/daemon/channel-provider-command.ts` | `/provider` provider switch + session refresh behavior |
| `src/daemon/channel-trace-command.ts` | `/trace` run-trace read/render behavior |
| `src/adapters/telegram.adapter.ts` | Telegram command + callback wiring |
| `src/shared/settings.ts` | runtime session concurrency parsing/validation |
