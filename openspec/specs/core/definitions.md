# Core: Field Definitions & Data Model

This document defines the field mappings between code (TypeScript), SQLite, and stable CLI output keys for core CLIClaw entities.

For command flags and examples, see `openspec/specs/cli/spec.md` and `openspec/specs/cli/commands.md`.

Cross-cutting naming, boss-marker, and short-id conventions are canonical in `openspec/specs/core/spec.md`.

## Canonical Mappings (selected)

- `envelope.deliverAt` → SQLite `deliver_at` → `--deliver-at` → `deliver-at:`
- `envelope.priority` → SQLite `priority` → `--interrupt-now` (when `1`)
- `envelope.createdAt` → SQLite `created_at` → `created-at:`
- `envelope.fromBoss` → SQLite `from_boss` → `[boss]` suffix in rendered sender lines
- `agent.relayMode` → SQLite `agents.relay_mode` → `settings.agents[].relay-mode`
- `chatState.relayOn` → SQLite `chat_state.relay_on` → RPC `chat.relay-toggle`
- `config.bossTimezone` → SQLite `config.boss_timezone` → setup `boss-timezone` → `boss-timezone:`
- `config.uiLocale` (legacy optional cache key) → SQLite `config.ui_locale` → env override `CLICLAW_UI_LOCALE`
- `config.userPermissionPolicy` → SQLite `config.user_permission_policy` → `settings.tokens[]`
- `channelUserAuth.token` → SQLite `channel_user_auth.token` → `/login <token>` session auth
- `runtime.sessionSummary.recentDays` → SQLite `config.runtime_session_summary_recent_days` → `settings.runtime.session-summary.recent-days`
- `runtime.sessionSummary.perSessionMaxChars` → SQLite `config.runtime_session_summary_per_session_max_chars` → `settings.runtime.session-summary.per-session-max-chars`
- `runtime.sessionSummary.maxRetries` → SQLite `config.runtime_session_summary_max_retries` → `settings.runtime.session-summary.max-retries`
- `runtime.telegram.commandReplyAutoDeleteSeconds` → SQLite `config.runtime_telegram_command_reply_auto_delete_seconds` → `settings.runtime.telegram.command-reply-auto-delete-seconds`
- `runtime.telegram.inboundInterruptWindowSeconds` → SQLite `config.runtime_telegram_inbound_interrupt_window_seconds` → `settings.runtime.telegram.inbound-interrupt-window-seconds`
- `runtime.deployment.mode` → `settings.runtime.deployment.mode` (settings-only; not mirrored to SQLite config)
- `runtime.deployment.outputDir` → `settings.runtime.deployment.output-dir` (settings-only; not mirrored to SQLite config)

Derived (not stored):
- `daemon-timezone:` is computed from the daemon host (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

---

## Addresses

| Type | Format | Example |
|------|--------|---------|
| Agent | `agent:<name>` | `agent:nex` |
| Agent send (new chat) | `agent:<name>:new` | `agent:nex:new` |
| Agent send (existing chat) | `agent:<name>:<chat-id>` | `agent:nex:agent-chat-123` |
| Team broadcast | `team:<name>` | `team:research` |
| Team mention | `team:<name>:<agent>` | `team:research:nex` |
| Channel | `channel:<adapter>:<chat-id>` | `channel:telegram:123456` |

Reserved agent addresses:
- none (all `agent:<name>` addresses map to normal registered agents).

---

## Envelope

Table: `envelopes` (see `src/daemon/db/schema.ts`)

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `envelope.id` | `id` | UUID |
| `envelope.from` | `from` | Sender address |
| `envelope.to` | `to` | Destination address |
| `envelope.fromBoss` | `from_boss` | `0/1` boolean |
| `envelope.content.text` | `content_text` | Nullable |
| `envelope.content.attachments` | `content_attachments` | JSON (nullable) |
| `envelope.priority` | `priority` | Integer (`0` normal, `1` interrupt-now) |
| `envelope.deliverAt` | `deliver_at` | Unix epoch ms (UTC) (nullable) |
| `envelope.status` | `status` | `pending` or `done` |
| `envelope.createdAt` | `created_at` | Unix epoch ms (UTC) |
| `envelope.metadata` | `metadata` | JSON (nullable); channel semantics + `chatScope` |

Status semantics:
- `pending`: not yet fully processed (waiting for deliver-at, agent read, or channel delivery).
- `done`: terminal (successful delivery/read, or terminal delivery failure with `metadata.lastDeliveryError`).

---

## Session Registry

### `agent_sessions`

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `agentSession.id` | `id` | UUID |
| `agentSession.agentName` | `agent_name` | Owner agent |
| `agentSession.provider` | `provider` | `claude` or `codex` |
| `agentSession.providerSessionId` | `provider_session_id` | Provider thread/session id (nullable) |
| `agentSession.createdAt` | `created_at` | Unix epoch ms |
| `agentSession.lastActiveAt` | `last_active_at` | Unix epoch ms |
| `agentSession.lastAdapterType` | `last_adapter_type` | Last channel adapter (nullable) |
| `agentSession.lastChatId` | `last_chat_id` | Last channel chat id (nullable) |

### `channel_session_bindings`

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `binding.agentName` | `agent_name` | Owner agent |
| `binding.adapterType` | `adapter_type` | e.g. `telegram` |
| `binding.chatId` | `chat_id` | Channel chat id |
| `binding.sessionId` | `session_id` | FK -> `agent_sessions.id` |
| `binding.ownerUserId` | `owner_user_id` | Global user token (nullable) |
| `binding.updatedAt` | `updated_at` | Unix epoch ms |

Unique key: `(agent_name, adapter_type, chat_id)`.

### `channel_session_links`

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `link.agentName` | `agent_name` | Owner agent |
| `link.adapterType` | `adapter_type` | Channel adapter |
| `link.chatId` | `chat_id` | Channel chat id |
| `link.sessionId` | `session_id` | FK -> `agent_sessions.id` |
| `link.ownerUserId` | `owner_user_id` | Global user token (nullable) |
| `link.firstSeenAt` | `first_seen_at` | Unix epoch ms |
| `link.lastSeenAt` | `last_seen_at` | Unix epoch ms |

Unique key: `(agent_name, adapter_type, chat_id, session_id)`.

---

## Channel User Auth

Table: `channel_user_auth` (see `src/daemon/db/schema.ts`)

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `channelAuth.id` | `id` | UUID |
| `channelAuth.adapterType` | `adapter_type` | Channel adapter (`telegram`, etc.) |
| `channelAuth.channelUserId` | `channel_user_id` | Adapter-side user id |
| `channelAuth.token` | `token` | User token from `settings.tokens[]` |
| `channelAuth.channelUsername` | `channel_username` | Normalized username (nullable) |
| `channelAuth.updatedAt` | `updated_at` | Unix epoch ms |

Unique key: `(adapter_type, channel_user_id)`.

---

## Chat State

Table: `chat_state` (see `src/daemon/db/schema.ts`)

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `chatState.agentName` | `agent_name` | Owner agent |
| `chatState.chatId` | `chat_id` | Session/chat scope key |
| `chatState.relayOn` | `relay_on` | `0/1` boolean; interactive relay mode toggle |

Unique key: `(agent_name, chat_id)`.

---

## Agent

Table: `agents` (see `src/daemon/db/schema.ts`)

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `agent.name` | `name` | Primary key |
| `agent.token` | `token` | Plaintext |
| `agent.description` | `description` | Nullable |
| `agent.workspace` | `workspace` | Nullable |
| `agent.provider` | `provider` | `claude` or `codex` |
| `agent.model` | `model` | Nullable (`NULL` = provider default) |
| `agent.reasoningEffort` | `reasoning_effort` | Nullable (`NULL` = provider default) |
| `agent.permissionLevel` | `permission_level` | `restricted`, `standard`, `privileged`, `admin` |
| `agent.sessionPolicy` | `session_policy` | JSON (nullable) |
| `agent.relayMode` | `relay_mode` | `default-on` or `default-off` (`default-off` when unset) |
| `agent.createdAt` | `created_at` | Unix epoch ms (UTC) |
| `agent.lastSeenAt` | `last_seen_at` | Unix epoch ms (nullable) |
| `agent.metadata` | `metadata` | JSON (nullable) |

### Agent Metadata (Reserved Keys)

- `metadata.providerCli`: optional per-agent provider CLI overrides
  - `metadata.providerCli.claude.env` (string env map)
  - `metadata.providerCli.codex.env` (string env map)
  - Common examples: `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`

---

## Team

Tables: `teams`, `team_members` (see `src/daemon/db/schema.ts`)

`teams`:

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `team.name` | `name` | Primary key |
| `team.description` | `description` | Nullable |
| `team.status` | `status` | `active` or `archived` |
| `team.kind` | `kind` | `manual` |
| `team.createdAt` | `created_at` | Unix epoch ms (UTC) |
| `team.metadata` | `metadata` | JSON (nullable) |

`team_members`:

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `teamMember.teamName` | `team_name` | FK -> `teams.name` |
| `teamMember.agentName` | `agent_name` | FK -> `agents.name` |
| `teamMember.source` | `source` | `manual` |
| `teamMember.createdAt` | `created_at` | Unix epoch ms (UTC) |

---

## Agent Run

Table: `agent_runs` (see `src/daemon/db/schema.ts`)

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `agentRun.id` | `id` | UUID |
| `agentRun.agentName` | `agent_name` | Owner agent |
| `agentRun.startedAt` | `started_at` | Unix epoch ms |
| `agentRun.completedAt` | `completed_at` | Unix epoch ms (nullable) |
| `agentRun.envelopeIds` | `envelope_ids` | JSON array (nullable) |
| `agentRun.finalResponse` | `final_response` | Final provider text (nullable) |
| `agentRun.contextLength` | `context_length` | Token count snapshot (nullable) |
| `agentRun.status` | `status` | `running`, `completed`, `failed`, `cancelled` |
| `agentRun.error` | `error` | Error text (nullable) |

---

## Binding

Table: `agent_bindings` (see `src/daemon/db/schema.ts`)

| Code (TypeScript) | SQLite column | Notes |
|-------------------|-------------|-------|
| `binding.id` | `id` | UUID |
| `binding.agentName` | `agent_name` | Agent name |
| `binding.adapterType` | `adapter_type` | e.g. `telegram` |
| `binding.adapterToken` | `adapter_token` | Adapter credential |
| `binding.createdAt` | `created_at` | Unix epoch ms (UTC) |

---

## Reaction

`cliclaw reaction set` prints:
- `success: true|false`

---

## TypeScript Interfaces

The current shapes live in:
- `src/envelope/types.ts`
- `src/agent/types.ts`
