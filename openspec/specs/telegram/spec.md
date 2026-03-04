# Telegram Adapter

The Telegram adapter bridges Telegram updates and Hi-Boss envelopes.

Key files: `src/adapters/telegram.adapter.ts`, `src/adapters/telegram/incoming.ts`, `src/adapters/telegram/outgoing.ts`, `src/daemon/bridges/channel-bridge.ts`, `src/daemon/channel-commands.ts`

## Inbound / Outbound

Inbound (Telegram -> agent):
- Envelopes created with `from: channel:telegram:<chat-id>`
- `fromBoss` set when logged-in token belongs to a policy user with `role: admin`
- First authorized inbound message routes immediately; follow-up messages within a per-chat interrupt window are re-sent as merged envelope with `interrupt-now` semantics

Outbound (agent -> Telegram):
- Standard channel delivery via router/adapter
- Optional reply quoting resolved from `replyToEnvelopeId`

## Command Authorization

Token policy (`settings.tokens[]`) required; authorization is token-based:
- Chat must call `/login <token>` first
- Runtime stores per-platform user auth in `channel_user_auth` (`adapter_type + channel_user_id`), with username fallback lookup when ID is unavailable
- `role: admin` → access all agents; `role: user` + `agents[]` → scoped access
- Target adapter must be bound to the agent

## Supported Commands

- `/login <token>` → bind chat to token
- `/new` → fresh session for current chat
- `/trace` → current run trace snapshot
- `/provider <claude|codex> [model=...] [reasoning-effort=...]` → switch provider + refresh
- `/status` → agent status (includes override and effective provider/model/reasoning)
- `/abort` → cancel run/queue for this chat, clear due pending non-cron inbox for this chat only
- `/isolated` → one-shot fresh run
- `/clone` → one-shot clone-context run

## Address and Metadata

Address: `channel:telegram:<chat-id>` (numeric; groups are negative)

Stored envelope metadata:
```ts
metadata: {
  platform: "telegram",
  channelMessageId: string,
  channelMessageIds?: string[],
  channelUser: { id, username?, displayName },
  channelUsers?: Array<{ id, username?, displayName }>,
  userTokens?: string[],
  chat: { id, name? }
}
```

## Limits / Behavior

- Text split limit: 4096 chars
- Caption limit: 1024 chars
- Media-group: prefers `sendMediaGroup`
- Inbound interrupt window: `runtime.telegram.inbound-interrupt-window-seconds` (default `3`)
- Uploaded filenames preserve provided filename or basename
- Typing status heartbeat while agent execution is queued or active
- Slash-command responses auto-deleted after `runtime.telegram.command-reply-auto-delete-seconds` (default `30`; `0` disables)

## Configuration

Interactive setup asks for boss Telegram usernames and seeds admin token entries in `settings.tokens[]` with Telegram `bindings[]`.

`settings.runtime.telegram.command-reply-auto-delete-seconds` controls auto-delete timing.
`settings.runtime.telegram.inbound-interrupt-window-seconds` controls rapid follow-up inbound interrupt behavior.
