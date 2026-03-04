# Web Frontend: WebSocket Events

Events pushed from daemon to connected frontend clients.

## Event Types

| Event | Payload | Trigger |
|---|---|---|
| `envelope.new` | Envelope data | New envelope created/delivered |
| `envelope.done` | Envelope ID | Envelope marked done |
| `agent.status` | Agent name + state | Agent state change (idle/running) |
| `agent.registered` | Agent data | New agent registered |
| `agent.deleted` | Agent name | Agent deleted |
| `agent.log` | Agent name + chat ID + line | Provider CLI stdout/stderr line |
| `session.started` | Session data | New session started |
| `session.ended` | Session ID | Session closed |
| `cron.fired` | Schedule ID + envelope ID | Cron schedule triggered |
| `run.started` | Run data | Agent run started |
| `run.completed` | Run data | Agent run completed/failed |

## Daemon Changes Required

1. **HTTP server** (`src/daemon/http/`): Express or native `http`, REST handlers (thin RPC wrappers), static file serving, CORS for dev, token validation middleware.

2. **WebSocket server** (`src/daemon/ws/`): Connection management (auth on connect), event broadcasting, per-agent log streaming channel.

3. **Event emitter hooks**: Emit on envelope creation/completion, agent state changes, session lifecycle, cron fires.

4. **Agent log capture**: Capture provider CLI stdout/stderr, buffer and stream to WS subscribers, associate with agent name + chat ID.
