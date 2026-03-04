## ADDED Requirements

### Requirement: HTTP server embedded in daemon
The daemon SHALL start an HTTP server on a configurable port (default 3889, env `HIBOSS_HTTP_PORT`) when the daemon starts. The HTTP server SHALL share the daemon process and have direct access to internal RPC methods.

#### Scenario: Daemon starts HTTP server
- **WHEN** the daemon starts
- **THEN** the HTTP server SHALL listen on the configured port and accept connections

#### Scenario: Custom port via environment variable
- **WHEN** `HIBOSS_HTTP_PORT` is set to `4000`
- **THEN** the HTTP server SHALL listen on port 4000

### Requirement: REST endpoints map to internal RPC methods
The HTTP server SHALL expose REST endpoints that translate HTTP requests to internal RPC method calls. Token authentication SHALL use the `Authorization: Bearer <token>` header. Response format SHALL be JSON.

#### Scenario: Agent list endpoint
- **WHEN** a GET request is made to `/api/agents` with a valid admin token
- **THEN** the server SHALL call `agent.list` internally and return the result as JSON with status 200

#### Scenario: Agent register endpoint
- **WHEN** a POST request is made to `/api/agents` with valid admin token and agent data in the JSON body
- **THEN** the server SHALL call `agent.register` internally and return the created agent and token as JSON with status 201

#### Scenario: Agent status endpoint
- **WHEN** a GET request is made to `/api/agents/:name` with a valid token
- **THEN** the server SHALL call `agent.status` with the agent name and return the result as JSON

#### Scenario: Agent update endpoint
- **WHEN** a PATCH request is made to `/api/agents/:name` with valid admin token and update fields
- **THEN** the server SHALL call `agent.set` internally and return the updated agent

#### Scenario: Agent delete endpoint
- **WHEN** a DELETE request is made to `/api/agents/:name` with valid admin token
- **THEN** the server SHALL call `agent.delete` internally and return success

#### Scenario: Agent abort endpoint
- **WHEN** a POST request is made to `/api/agents/:name/abort` with valid token
- **THEN** the server SHALL call `agent.abort` internally and return the result

#### Scenario: Agent refresh endpoint
- **WHEN** a POST request is made to `/api/agents/:name/refresh` with valid token
- **THEN** the server SHALL call `agent.refresh` internally and return success

#### Scenario: Envelope send endpoint
- **WHEN** a POST request is made to `/api/envelopes` with valid token and envelope data
- **THEN** the server SHALL call `envelope.send` internally and return the envelope ID

#### Scenario: Envelope list endpoint
- **WHEN** a GET request is made to `/api/envelopes` with valid token and query parameters (to, from, status, limit)
- **THEN** the server SHALL call `envelope.list` internally and return the envelopes

#### Scenario: Envelope thread endpoint
- **WHEN** a GET request is made to `/api/envelopes/:id/thread` with valid token
- **THEN** the server SHALL call `envelope.thread` internally and return the thread

#### Scenario: Auth login endpoint
- **WHEN** a POST request is made to `/api/auth/login` with a token in the JSON body
- **THEN** the server SHALL call `admin.verify` and return `{ valid: true/false }`

#### Scenario: Daemon status endpoint
- **WHEN** a GET request is made to `/api/daemon/status` with valid token
- **THEN** the server SHALL call `daemon.status` and return the result

#### Scenario: Daemon time endpoint
- **WHEN** a GET request is made to `/api/daemon/time` with valid token
- **THEN** the server SHALL call `daemon.time` and return the result

#### Scenario: Setup check endpoint
- **WHEN** a GET request is made to `/api/setup/check`
- **THEN** the server SHALL call `setup.check` (no token required) and return the result

#### Scenario: Invalid token
- **WHEN** a request is made with an invalid or missing token to a protected endpoint
- **THEN** the server SHALL return HTTP 401 with `{ error: "Unauthorized" }`

#### Scenario: CORS headers in development
- **WHEN** a request includes an `Origin` header
- **THEN** the server SHALL include CORS headers allowing the origin (for local dev with frontend on different port)

### Requirement: Admin token can proxy envelope operations
The HTTP server SHALL allow admin-token-authenticated requests to perform envelope operations (send, list, thread) on behalf of agents. The server SHALL resolve the target agent internally and execute the operation.

#### Scenario: Admin sends envelope to agent
- **WHEN** an admin-token-authenticated POST to `/api/envelopes` sends `{ to: "agent:nex:new", text: "hello" }`
- **THEN** the server SHALL create the envelope as a boss-sent message (`fromBoss: true`) and return the envelope ID

#### Scenario: Admin lists agent conversations
- **WHEN** an admin-token-authenticated GET to `/api/envelopes` includes `to=agent:nex` or `from=agent:nex`
- **THEN** the server SHALL return envelopes for that agent

### Requirement: WebSocket server for real-time events
The daemon SHALL run a WebSocket server on the same port as the HTTP server (upgrade path). Clients connect to `ws://host:port/ws?token=<token>`. The server SHALL authenticate the token on connection and reject invalid tokens.

#### Scenario: Client connects with valid token
- **WHEN** a WebSocket client connects to `/ws?token=<valid-admin-token>`
- **THEN** the server SHALL accept the connection and send a `snapshot` event with current state

#### Scenario: Client connects with invalid token
- **WHEN** a WebSocket client connects to `/ws?token=<invalid-token>`
- **THEN** the server SHALL reject the connection with close code 4001

#### Scenario: Snapshot event on connect
- **WHEN** a client successfully connects
- **THEN** the server SHALL send a `snapshot` event containing: agents list, agent statuses, daemon status

### Requirement: Event broadcasting via WebSocket
The daemon SHALL emit typed events through the WebSocket server when state changes occur. All connected clients SHALL receive all events.

#### Scenario: New envelope created
- **WHEN** a new envelope is created in the system
- **THEN** the server SHALL broadcast `{ type: "envelope.new", payload: <envelope> }` to all connected clients

#### Scenario: Envelope marked done
- **WHEN** an envelope status changes to done
- **THEN** the server SHALL broadcast `{ type: "envelope.done", payload: { id } }`

#### Scenario: Agent status changes
- **WHEN** an agent's state changes (idle ↔ running, health changes)
- **THEN** the server SHALL broadcast `{ type: "agent.status", payload: { name, status } }`

#### Scenario: Agent registered
- **WHEN** a new agent is registered
- **THEN** the server SHALL broadcast `{ type: "agent.registered", payload: <agent> }`

#### Scenario: Agent deleted
- **WHEN** an agent is deleted
- **THEN** the server SHALL broadcast `{ type: "agent.deleted", payload: { name } }`

#### Scenario: Agent log line
- **WHEN** an agent's provider CLI emits a stdout/stderr line
- **THEN** the server SHALL broadcast `{ type: "agent.log", payload: { name, chatId, line } }` to connected clients

#### Scenario: Run lifecycle events
- **WHEN** an agent run starts or completes
- **THEN** the server SHALL broadcast `{ type: "run.started" }` or `{ type: "run.completed" }` with run data

### Requirement: Event bus for internal event distribution
The daemon SHALL have a central `DaemonEventBus` (EventEmitter) that decouples event production from WebSocket transport. Existing daemon code SHALL emit events through this bus.

#### Scenario: Envelope creation emits event
- **WHEN** `createEnvelope()` is called in the daemon
- **THEN** the event bus SHALL emit an `envelope.new` event with the envelope data

#### Scenario: Agent state change emits event
- **WHEN** `setAgentState()` is called
- **THEN** the event bus SHALL emit an `agent.status` event

#### Scenario: WebSocket server subscribes to event bus
- **WHEN** the WebSocket server starts
- **THEN** it SHALL subscribe to all event bus events and broadcast them to connected clients
