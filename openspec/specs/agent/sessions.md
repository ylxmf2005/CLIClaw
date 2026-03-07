# Agent: Session Management

## Overview

CLIClaw sessions are **always chat-scoped**:

- `channel:*` envelopes use per-chat mapping (`agent + adapter + chat-id -> session`)
- agent-origin envelopes with `metadata.chatScope` use the same mapping with `adapter_type="internal"` and `chat_id=chatScope`
- agent-origin envelopes without `chatScope` are mapped to synthesized internal chat ids (e.g. `cron:<schedule-id>` or `internal:<from>:to:<target>`)
- multiple chats can intentionally point to the same session id

Session IDs are UUID-backed internally and shown as short IDs in operator-facing surfaces.

## Session Lifecycle

### Creation

Sessions are created on-demand when an agent processes due envelopes:

1. Executor reads due envelopes for an agent.
2. Envelopes are grouped by target session scope.
3. For `channel:*`: resolve/create session via `channel_session_bindings`.
4. For agent-origin with `chatScope`: resolve/create internal channel mappings (`adapter_type="internal"`).
5. For agent-origin without `chatScope`: synthesize deterministic internal chat id and resolve.
6. Runtime session object loaded or created and reused for that scope.
7. Provider session/thread id updated from CLI output after each successful run.

### Reuse

- Same scope reuses same runtime session object.
- Different scopes can run concurrently.
- Two chats mapped to the same session id share context and execute serially.

### Refresh

| Trigger | Description |
|---------|-------------|
| `dailyResetAt` | Configured time of day |
| `idleTimeout` | No activity for configured duration |
| `maxContextLength` | Context-length threshold exceeded |
| Manual `/new` | Creates and switches current chat to fresh session |
| Manual `/provider <claude\|codex> [...]` | Switches provider + requests agent-wide refresh on change |
| Daemon restart | Runtime cache rebuilt from DB state |

Scope semantics:
- Policy refreshes (`dailyResetAt`, `idleTimeout`, `maxContextLength`) are scope-local.
- Agent-wide refreshes are explicit/manual (`/provider`, RPC `agent.refresh`, delete, etc.).

### Session Close

When CLIClaw closes the current runtime session:
- compact-writes session events from append-only journal into JSON history file, marks `endedAtMs`
- writes/updates markdown companion with `ended-at` and `summary-status: pending`
- keeps append-only JSONL event logs for real-time and crash-safe history capture
- does not run a background summary worker

Opportunistic journal compaction during active sessions on threshold/interval triggers.

## Storage

### In-memory (runtime)

`src/agent/executor.ts` keeps:
- channel session cache (session-id keyed)
- per-session serialization locks
- global/per-agent concurrency semaphores
- active session history fallback buffers

### SQLite (durable)

- `agent_sessions` — session registry
- `channel_session_bindings` — current mapped session id per `(agent_name, adapter_type, chat_id)`
- `channel_session_links` — visibility/history links

Per-agent session history files:
- `agents/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<session-id>.json` — compacted events
- `agents/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<session-id>.events.jsonl` — append-only event log
- `agents/<agent>/internal_space/history/YYYY-MM-DD/<chat-id>/<session-id>.md` — conversation markdown + frontmatter

## Concurrency

- **Across sessions:** parallel (bounded)
- **Within one session:** strictly serial

Default limits:
- per-agent: `4`
- global: `16`

Config keys:
- `runtime_session_concurrency_per_agent`
- `runtime_session_concurrency_global`

## Key Files

| File | Purpose |
|------|---------|
| `src/agent/executor.ts` | Session scope resolution, execution scheduling, concurrency |
| `src/daemon/db/database.ts` | Session persistence |
| `src/daemon/channel-commands.ts` | `/new`, `/trace`, `/provider` |
| `src/daemon/channel-provider-command.ts` | `/provider` switch + refresh |
| `src/daemon/channel-trace-command.ts` | `/trace` render |
| `src/adapters/telegram.adapter.ts` | Telegram command wiring |
| `src/shared/settings.ts` | Runtime concurrency parsing |
