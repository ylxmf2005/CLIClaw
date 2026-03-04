# Envelope: Model, Routing & Scheduling

An **envelope** is Hi-Boss's internal durable message record (SQLite table: `envelopes`).

Every message between:
- a human (via an adapter like Telegram) and an agent
- an agent and another agent
- an agent and a channel

is represented as an envelope that the daemon routes and eventually terminalizes (`status=done`).

## Addressing

See `openspec/specs/core/definitions.md#addresses` and `src/adapters/types.ts` (`parseAddress`).

## Fields

Field mappings: `openspec/specs/core/definitions.md` (TypeScript ↔ SQLite ↔ CLI output keys).

---

## Lifecycle

### Creation

Envelopes are created by:
- Adapters → daemon (e.g., Telegram inbound messages), via `src/daemon/bridges/channel-bridge.ts`
- Agents → daemon, via `hiboss envelope send` / `envelope.send`

New envelopes start as `status=pending`.

### Scheduling (`deliverAt`)

Scheduling is "not-before delivery". See Scheduler section below.

### When does an envelope become `done`?

Envelopes are **at-most-once**: once acknowledged as read/delivered they are terminalized and not retried.

- To an agent (agent run): marked `done` immediately after read (`src/agent/executor.ts`).
- To an agent (manual read): listing incoming pending envelopes is treated as an ACK.
- To a channel: marked `done` after an adapter send attempt; failures are terminal and recorded in `metadata.lastDeliveryError`.

Permission note:
- Sending to `channel:<adapter>:...` is only allowed if the sending agent is bound to that adapter type.

Interrupt-now note:
- `hiboss envelope send --interrupt-now --to agent:<name>:new|<chat-id>` interrupts the target agent's current/queued work with higher queue priority.
- Existing unread pending envelopes are preserved; no queue-clear is performed.
- `--interrupt-now` is mutually exclusive with `--deliver-at`.

### Chat Scope

Agent-origin sends stamp `envelope.metadata.chatScope` for session routing:
- New agent chat: generated `agent-chat-...` (via `agent:<name>:new`)
- Existing agent chat: caller-provided `<chat-id>` (via `agent:<name>:<chat-id>`)
- Team: `team:<team-name>`

Executor resolves agent-origin envelopes with `chatScope` through `channel_session_bindings` with `adapter_type="internal"`.

Agent-origin envelopes without `chatScope` are mapped to a synthesized internal chat id (e.g. `internal:<from>:to:<target>` or `cron:<schedule-id>`).

### Origin Tracking

Envelope origin is tracked in `metadata.origin` for audit/history (`cli | channel | cron | internal`).

---

## Reply / Threading

Hi-Boss uses a single reply/thread mechanism for both channel quoting and agent↔agent context threading.

- `hiboss envelope send --reply-to <envelope-id>` sets `envelope.metadata.replyToEnvelopeId`.
- `hiboss envelope thread --envelope-id <id>` follows `replyToEnvelopeId` pointers up to the root.
- For channel destinations, adapters may use the referenced envelope's channel message id for platform-native quoting.

Platform message ids (e.g., Telegram `message_id`) are stored in `envelope.metadata.channelMessageId` but are intentionally not shown to agents.

---

## Routing & Envelope Flow

Key files: `src/daemon/daemon.ts`, `src/daemon/bridges/channel-bridge.ts`, `src/daemon/router/message-router.ts`, `src/daemon/scheduler/envelope-scheduler.ts`, `src/agent/executor.ts`

### Inbound Flow (Telegram -> Agent)

1. Telegram update -> `TelegramAdapter` emits `ChannelMessage`.
2. `ChannelBridge` resolves bound agent and creates envelope (`from: channel:telegram:<chat-id>`, `to: agent:<agent-name>`).
3. Envelope persisted as `pending`.
4. Agent handler triggers `executor.checkAndRun(...)`.
5. Executor reads due envelopes, groups by session scope, marks read envelopes `done`, and schedules per-session execution.

### Session-aware Agent Routing

Session scope resolution:
- Agent source + `metadata.chatScope`: resolve via `channel_session_bindings` using `adapter_type="internal"`.
- Channel source: resolve via `channel_session_bindings`.
- Agent source without `chatScope`: synthesize internal `chat_id` and resolve.

Execution: same session id => serial; different session ids => parallel (subject to limits).

### Agent-to-Agent Flow

- `--to agent:<name>:new` → stamps `metadata.chatScope = agent-chat-...` (generated)
- `--to agent:<name>:<chat-id>` → stamps `metadata.chatScope = <chat-id>`
- `--to team:<name>` → fans out one envelope per member excluding sender, stamps `metadata.chatScope = team:<name>`
- `--to team:<name>:<agent>` → one envelope to mentioned member, stamps `metadata.chatScope = team:<name>`

`--interrupt-now` is allowed only for single-agent destinations, not for `team:<name>` broadcast.

### Outbound Flow (Agent -> Channel)

1. Agent sends envelope to `channel:<adapter>:<chat-id>`.
2. Router validates binding and resolves adapter.
3. For Telegram, optional quote/reply resolution uses `replyToEnvelopeId`.
4. Adapter sends platform message; envelope marked `done` on success.

### Telegram Command Routing

Authorized command set (after `/login <token>` and token-scope checks): `/status`, `/trace`, `/abort`, `/new`, `/provider`, `/isolated`, `/clone`.

See `openspec/specs/telegram/spec.md` for details.

---

## Scheduler (deliver-at)

Key files: `src/shared/time.ts`, `src/daemon/scheduler/envelope-scheduler.ts`, `src/daemon/db/database.ts`

### `deliver-at` Parsing

`hiboss envelope send --deliver-at <time>` accepts:
- Relative: `+2h`, `+30m`, `+1Y2M3D`, `-15m` (units case-sensitive: `Y/M/D/h/m/s`)
- ISO 8601 with timezone: `2026-01-27T16:30:00+08:00` (or UTC `Z`)
- ISO-like without timezone (interpreted in boss timezone): `YYYY-MM-DDTHH:MM[:SS]`

Stored as **unix epoch milliseconds (UTC)** in `envelopes.deliver_at`.

### Due Check

An envelope is due when:
- `deliver_at` is `NULL`, or
- `deliver_at <= now`

### Tick Behavior

On daemon start, `EnvelopeScheduler.start()` immediately runs a tick.

Each tick:
1. **Deliver due channel envelopes**: `db.listDueChannelEnvelopes(limit)`, router delivers each, failures are terminal.
2. **Trigger agents with due envelopes**: `db.listAgentNamesWithDueEnvelopes()`, calls `executor.checkAndRun(agent, db)`.
   - Orphan cleanup: envelopes to missing/deleted agents are marked `done` (terminal) with `last-delivery-error-*`. Batched (100), capped per tick (2000).

### Wake-up Algorithm

Queries earliest pending scheduled envelope (`deliver_at > now`), then:
- `setImmediate` if already due
- `setTimeout` with clamped delay (max ~24.8 days)

### Ordering

`ORDER BY COALESCE(deliver_at, created_at) ASC, created_at ASC`
