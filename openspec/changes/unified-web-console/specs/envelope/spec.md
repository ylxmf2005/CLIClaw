## MODIFIED Requirements

### Requirement: Outbound Flow (Agent -> Channel)

1. Agent sends envelope to `channel:<adapter>:<chat-id>`.
2. Router validates binding and resolves adapter.
3. Router looks up the session for this binding via `channel_session_bindings`.
4. Router queries all other bindings for the same session (fan-out lookup).
5. For each bound adapter (including the originally addressed one):
   - Resolve the adapter instance.
   - Call `adapter.sendMessage(chatId, content, options)`.
   - On success, mark delivery complete for that adapter.
6. For the originally addressed adapter (e.g., Telegram), optional quote/reply resolution uses `replyToEnvelopeId`.
7. Envelope marked `done` when the primary adapter delivery succeeds.

#### Scenario: Agent replies to channel with single binding
- **WHEN** an agent sends a reply to `channel:telegram:12345`
- **THEN** the router delivers to the Telegram adapter
- **THEN** envelope is marked `done`

#### Scenario: Agent replies to channel with multi-bound session
- **WHEN** an agent sends a reply to `channel:telegram:12345`
- **WHEN** the session for `(nex, telegram, 12345)` also has binding `(nex, console, abc123)`
- **THEN** the router delivers to the Telegram adapter (primary)
- **THEN** the router also delivers to the console adapter (fan-out)
- **THEN** envelope is marked `done` after primary delivery succeeds

#### Scenario: Fan-out delivery failure is non-blocking
- **WHEN** the primary adapter delivery succeeds but a fan-out adapter delivery fails
- **THEN** the envelope is still marked `done`
- **THEN** the failed fan-out delivery is logged but does not block the primary
