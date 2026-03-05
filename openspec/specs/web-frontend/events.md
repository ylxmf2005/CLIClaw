# Web Frontend: WebSocket Events

Daemon WebSocket endpoint: `/ws` (same port as HTTP API, default `3889`).

## Connection and Auth

- Client connects with query token: `ws://<host>:<port>/ws?token=<token>`
- Upgrade auth currently accepts admin tokens only (`verifyAdminToken`)
- Unauthorized upgrades are rejected with HTTP `401`

## Message Envelope

Server -> client messages use:

```json
{
  "type": "event.type",
  "payload": {},
  "timestamp": 1730000000000
}
```

`timestamp` is daemon-side `Date.now()` in unix ms.

## Initial Snapshot

On each successful connection, daemon sends a one-time `snapshot` event:

```json
{
  "type": "snapshot",
  "payload": {
    "agents": [
      {
        "name": "nex",
        "description": "optional",
        "provider": "claude",
        "relayMode": "default-off",
        "bindings": ["telegram"]
      }
    ],
    "agentStatuses": [
      { "name": "nex", "agentState": "idle" }
    ],
    "daemon": {
      "running": true,
      "startTimeMs": 1730000000000,
      "adapters": ["telegram"]
    }
  },
  "timestamp": 1730000000000
}
```

## Event Types (Server -> Client)

| Event | Payload shape | Emitted by |
|---|---|---|
| `envelope.new` | `{ envelope }` | router hook on envelope creation |
| `envelope.done` | `{ id }` | router hook on envelope completion |
| `agent.status` | `{ name, agentState, agentHealth, currentRun?, lastRun? }` | executor run lifecycle hooks |
| `agent.registered` | `{ name, description?, provider? }` | `agent.register` handler |
| `agent.deleted` | `{ name }` | `agent.delete` handler |
| `run.started` | `{ runId, agentName, startedAt }` | executor run start |
| `run.completed` | `{ runId, agentName, completedAt, status, error?, contextLength? }` | executor run finish |
| `agent.pty.output` | `{ name, chatId?, data }` | relay broker worker stream |
| `agent.log` | batched payload `{ lines: [{ name, chatId?, line }] }` | event-bus broadcast path (if emitted) |
| `agent.pty.input` | `{ name, chatId?, data }` | rebroadcast when any client sends PTY input |

Notes:
- `agent.log` is specially batched per client (`max 10 lines` or `100ms` debounce).
- Non-log events are broadcast immediately.

## Client -> Server Messages

Currently accepted inbound message:

```json
{
  "type": "agent.pty.input",
  "payload": {
    "name": "nex",
    "chatId": "optional-chat-scope",
    "data": "raw terminal input"
  }
}
```

Daemon emits this on the internal event bus and the relay broker forwards it to the corresponding PTY session.

## Removed / Not Emitted

The daemon does not currently emit:
- `session.started`
- `session.ended`
- `cron.fired`
