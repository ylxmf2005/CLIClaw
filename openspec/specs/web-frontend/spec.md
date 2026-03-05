# Web Frontend

A web management console and chat interface for Hi-Boss, backed by the daemon's built-in HTTP and WebSocket servers.

## Capabilities

1. Agent management (list/register/update/delete, status, refresh, abort)
2. Envelope messaging and thread/history viewing
3. Conversation list and chat-scoped relay toggle controls
4. Team and membership management
5. Cron schedule management
6. File upload for envelope attachments
7. Real-time updates via daemon WebSocket events and initial snapshot

## Architecture

Daemon-side web stack is embedded in the same daemon process as IPC/routing/execution.

```
daemon process
  ├── IPC server (Unix socket JSON-RPC)
  ├── HTTP server (Node native http)
  │   └── /api/* routes (thin RPC wrappers + upload endpoint)
  ├── WebSocket endpoint (/ws on HTTP upgrade)
  │   └── daemon event stream + snapshot
  └── Core (DB, scheduler, router, executor, adapters)
```

Key implementation files:
- `src/daemon/http/server.ts`
- `src/daemon/http/routes*.ts`
- `src/daemon/ws/server.ts`
- `src/daemon/events/event-bus.ts`

## HTTP Server Behavior

- Default listen port: `3889` (override with `HIBOSS_HTTP_PORT`)
- JSON request parsing for `Content-Type: application/json`
- Bearer-token extraction from `Authorization: Bearer <token>`
- CORS headers for browser clients (`GET, POST, PATCH, DELETE, OPTIONS`)
- RPC error mapping:
  - `-32001` -> HTTP `401`
  - `-32002` -> HTTP `404`
  - `-32003` -> HTTP `409`
  - `-32602` -> HTTP `400`
- Request body limits:
  - JSON: 11MB parser guard
  - Upload endpoint: 10MB file limit

## Authentication Model

- Login endpoint validates an admin token via `admin.verify`.
- Frontend stores token in `sessionStorage` key `hiboss_token`.
- API calls send `Authorization: Bearer <token>`.
- WebSocket connection uses query token: `/ws?token=<token>`.
- WebSocket upgrade currently requires a valid admin token.

## REST API

Routes are registered in `src/daemon/http/routes.ts`.

### Bootstrap / Auth (no bearer token required)

| Method | Path | RPC / Behavior |
|---|---|---|
| POST | `/api/auth/login` | `admin.verify` |
| GET | `/api/setup/check` | `setup.check` |

### Daemon

| Method | Path | RPC |
|---|---|---|
| GET | `/api/daemon/status` | `daemon.status` |
| GET | `/api/daemon/time` | `daemon.time` |

### Agents

| Method | Path | RPC |
|---|---|---|
| GET | `/api/agents` | `agent.list` |
| POST | `/api/agents` | `agent.register` |
| GET | `/api/agents/:name` | `agent.status` |
| PATCH | `/api/agents/:name` | `agent.set` |
| DELETE | `/api/agents/:name` | `agent.delete` |
| POST | `/api/agents/:name/abort` | `agent.abort` |
| POST | `/api/agents/:name/refresh` | `agent.refresh` |
| GET | `/api/agents/:name/conversations` | `envelope.conversations` |

Notes:
- `envelope.conversations` is admin-only under default permission policy.

### Envelopes

| Method | Path | RPC |
|---|---|---|
| POST | `/api/envelopes` | `envelope.send` |
| GET | `/api/envelopes` | `envelope.list` |
| GET | `/api/envelopes/:id/thread` | `envelope.thread` |

### Sessions / Chat Relay

| Method | Path | RPC / Behavior |
|---|---|---|
| GET | `/api/sessions?agentName=<name>` | `session.list` |
| POST | `/api/agents/:name/chats/:chatId/relay` | `chat.relay-toggle` |
| GET | `/api/agents/:name/chats/:chatId/relay` | direct read from `chat_state` (same auth/permission gate as `chat.relay-toggle`) |

### Upload

| Method | Path | RPC / Behavior |
|---|---|---|
| POST | `/api/upload` | multipart upload to daemon media storage (requires `envelope.send` permission) |

### Teams

| Method | Path | RPC |
|---|---|---|
| GET | `/api/teams` | `team.list` |
| POST | `/api/teams` | `team.register` |
| GET | `/api/teams/:name` | `team.status` |
| PATCH | `/api/teams/:name` | `team.set` |
| DELETE | `/api/teams/:name` | `team.delete` |
| GET | `/api/teams/:name/members` | `team.list-members` |
| POST | `/api/teams/:name/members` | `team.add-member` |
| DELETE | `/api/teams/:name/members/:agentName` | `team.remove-member` |

Note:
- There is no `/api/teams/:name/send` HTTP route; team fan-out send remains CLI/RPC (`team.send`).

### Cron

| Method | Path | RPC |
|---|---|---|
| GET | `/api/cron` | `cron.list` |
| POST | `/api/cron` | `cron.create` |
| POST | `/api/cron/:id/enable` | `cron.enable` |
| POST | `/api/cron/:id/disable` | `cron.disable` |
| DELETE | `/api/cron/:id` | `cron.delete` |

## Frontend Runtime Notes

- API client defaults:
  - HTTP: `NEXT_PUBLIC_API_URL` or `http://localhost:3889`
  - WS: `NEXT_PUBLIC_WS_URL` or `ws://localhost:3889/ws`
- App state stack:
  - `ThemeProvider -> AuthProvider -> WebSocketProvider -> AppStateProvider`
- Frontend type definitions live in `web/src/lib/types.ts`.

## WebSocket

Event contract and payload details are canonical in:
- `openspec/specs/web-frontend/events.md`
