## ADDED Requirements

### Requirement: Per-agent relay mode default
Each agent SHALL have a `relayMode` setting with values `"default-on"` or `"default-off"` (default: `"default-off"`). This determines whether new chats with this agent start in relay (interactive PTY) mode or pipe (non-interactive) mode.

#### Scenario: Agent configured as default-on
- **WHEN** the boss opens a new chat with an agent whose `relayMode` is `"default-on"`
- **THEN** the chat SHALL start in relay mode with an interactive terminal available

#### Scenario: Agent configured as default-off
- **WHEN** the boss opens a new chat with an agent whose `relayMode` is `"default-off"`
- **THEN** the chat SHALL start in pipe mode with a read-only terminal

### Requirement: Per-chat relay toggle
Each chat conversation SHALL have a relay on/off toggle in the chat header (next to the agent name). This overrides the agent-level default for this specific chat.

#### Scenario: Toggle relay on in chat header
- **WHEN** the boss clicks the relay toggle to enable relay mode
- **THEN** the chat SHALL switch to relay mode, the terminal SHALL become interactive, and the current session context SHALL be preserved (session resume via relay's `continueFrom`)

#### Scenario: Toggle relay off in chat header
- **WHEN** the boss clicks the relay toggle to disable relay mode
- **THEN** the chat SHALL switch to pipe mode and the terminal SHALL become read-only

#### Scenario: Session resume on mode switch
- **WHEN** the boss toggles relay mode and session resume succeeds
- **THEN** the agent SHALL continue with the same conversation context

#### Scenario: Session resume fails
- **WHEN** session resume fails during mode switch
- **THEN** the agent SHALL start a fresh session and a toast notification SHALL inform the boss

### Requirement: Relay broker lifecycle managed by daemon
The daemon SHALL start an `agent-relay-broker init` subprocess when the daemon starts (if relay functionality is available). All relay-on chats SHALL share this broker instance. The broker SHALL stop when the daemon stops.

#### Scenario: Daemon starts with relay broker available
- **WHEN** `hiboss daemon start` is called and `agent-relay-broker` binary is found in PATH
- **THEN** the daemon SHALL spawn `agent-relay-broker init` as a managed subprocess

#### Scenario: Daemon starts without relay broker
- **WHEN** `hiboss daemon start` is called but `agent-relay-broker` binary is not found
- **THEN** the daemon SHALL start normally without the relay broker; relay mode SHALL be unavailable; the UI SHALL show relay toggle as disabled with a tooltip explaining the missing dependency

#### Scenario: Daemon stops
- **WHEN** `hiboss daemon stop` is called
- **THEN** the daemon SHALL gracefully shut down the relay broker subprocess

### Requirement: Relay executor path
When a chat is in relay mode, the agent executor SHALL use `RelayAdapter.spawn()` to create a long-running PTY session instead of the pipe-based `-p` mode. The relay executor SHALL stream PTY output via `DaemonEventBus` and accept stdin input.

#### Scenario: Execute turn in relay mode
- **WHEN** an envelope arrives for an agent in a relay-on chat
- **THEN** the executor SHALL inject the envelope content into the running PTY session via `RelayAdapter.sendInput()` instead of spawning a new process

#### Scenario: Execute turn in pipe mode
- **WHEN** an envelope arrives for an agent in a relay-off chat
- **THEN** the executor SHALL use the existing pipe-based execution (spawn `claude -p`, pipe stdin, parse stream-json output)

#### Scenario: PTY output streaming
- **WHEN** the agent's PTY produces output (relay mode)
- **THEN** the daemon SHALL emit `agent.pty.output` events via `DaemonEventBus` with `{ name, chatId, data }` containing raw PTY bytes

### Requirement: Interactive terminal via WebSocket
When relay mode is on, the frontend terminal SHALL be bidirectional. The WS server SHALL support two new message types for PTY I/O.

#### Scenario: Boss types in terminal
- **WHEN** the boss types in the interactive terminal (xterm.js `onData`)
- **THEN** the frontend SHALL send `{ type: "agent.pty.input", payload: { name, chatId, data } }` via WebSocket, and the daemon SHALL call `RelayAdapter.sendInput(name, data)` to write to the PTY stdin

#### Scenario: PTY output displayed in terminal
- **WHEN** the daemon receives `worker_stream` events from the relay adapter
- **THEN** the daemon SHALL broadcast `{ type: "agent.pty.output", payload: { name, chatId, data } }` via WebSocket, and the frontend xterm.js SHALL render the raw bytes

#### Scenario: Terminal mode indicator
- **WHEN** the terminal split pane is open
- **THEN** the header SHALL show "Terminal (read-only)" when relay is off, or "Terminal (interactive)" when relay is on

### Requirement: Resizable terminal split pane
The right-side terminal split pane SHALL be resizable via a drag handle. Default width is 420px, minimum 280px, maximum 60% of viewport width.

#### Scenario: Drag to resize
- **WHEN** the boss drags the split pane edge
- **THEN** the terminal width SHALL adjust in real-time and xterm.js SHALL refit to the new dimensions

#### Scenario: Resize persists during session
- **WHEN** the boss resizes the terminal
- **THEN** the new width SHALL persist for the remainder of the session (not across page refreshes)
