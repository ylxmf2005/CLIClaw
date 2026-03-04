# Cron Schedules

Hi-Boss supports **cron schedules** as a thin layer on top of envelopes:

- A cron schedule is **persistent** (stored in SQLite).
- Each schedule **materializes** exactly one pending envelope at a time, with `deliver-at` set to the next cron occurrence.
- When that envelope becomes `done`, Hi-Boss materializes the next occurrence.

This keeps the core invariant intact: **envelopes are still the only delivery unit**.

---

## Storage

Table: `cron_schedules` (see `src/daemon/db/schema.ts`)

Important columns:

- `agent_name` — schedule owner (also the sender; `from = agent:<agent_name>`)
- `cron` — cron expression (5-field or 6-field with optional seconds; `@daily` etc supported)
- `timezone` — optional IANA timezone; `NULL` means "inherit boss timezone" (`config.boss_timezone`)
- `enabled` — `1` or `0`
- `pending_envelope_id` — the envelope id for the next scheduled occurrence (nullable)
- `to_address`, `content_text`, `content_attachments`, `metadata` — envelope template fields
- `metadata.executionMode` — cron execution mode (`isolated` default, `clone`, `inline`)
- `metadata.parseMode` — optional outbound parse mode (`plain`, `markdownv2`, `html`) for channel destinations

## Destination Constraints

Cron supports only:
- `agent:<name>` (agent inbox destination)
- `channel:<adapter>:<chat-id>` (channel destination)

Cron rejects:
- `team:<name>` / `team:<name>:<agent>`
- `agent:<name>:new` / `agent:<name>:<chat-id>`

Parse-mode note:
- `metadata.parseMode` is valid only when destination is `channel:*`.
- For non-channel destinations, parse-mode is rejected.

---

## Timezone Behavior

- If `timezone` is set, it is interpreted as an **IANA timezone** (e.g., `Asia/Tokyo`).
- If `timezone` is `NULL`, the schedule **inherits the current boss timezone** (`config.boss_timezone`). This means the schedule follows boss timezone changes.

The materialized envelope always stores `deliver-at` as **unix epoch milliseconds (UTC)**.

---

## Misfire Policy (skip)

On daemon start, Hi-Boss applies a **skip misfires** policy:

- If a schedule is enabled and its `pending_envelope_id` points to a **due** envelope (`deliver-at <= now`), that envelope is **canceled** (marked `done`) and the schedule is advanced to the next occurrence after `now`.

This happens before the envelope scheduler's startup tick, so missed cron runs are not delivered after downtime.

---

## Delivery & Advancement

Cron envelope metadata always includes:
- `origin: "cron"`
- `cronScheduleId: <cron-id>`

Execution-mode behavior:
- `inline`: materialized envelope keeps the configured `to` destination and runs through normal routing/session queues.
- `isolated` / `clone`: materialized envelope is routed to `to = agent:<owner>` with `metadata.oneshotType` set (`isolated|clone`), and original destination stored in `metadata.cronResponseTo`.

Completion + advancement:
- Inline channel envelopes: marked `done` after adapter send, then schedule advances.
- Inline agent envelopes: marked `done` when read for agent run (at-most-once), then schedule advances.
- One-shot cron envelopes: handled by one-shot execution flow and advanced when terminalized.

---

## CLI / RPC

- CLI: `hiboss cron ...` (see `openspec/specs/cli/commands.md`)
- RPC: `cron.*` methods (see `openspec/specs/cli/spec.md`)
