## Context

Team chat currently supports basic @mention routing: `@agentName` sends to one member, `@all` broadcasts, and no mention defaults to broadcast. The `resolveTeamRecipients()` utility in `web/src/lib/team-mentions.ts` handles single-mention parsing with regex. The backend `envelope-send-core.ts` already supports team fan-out via `sendEnvelopeFromAgent()` and the admin path via `sendEnvelopeFromBoss()`. The web frontend team page (`teams/[name]/page.tsx`) sends one envelope per recipient via the API.

Key constraint: the existing system treats "no mention" as implicit broadcast. The user wants this changed to require explicit targeting.

## Goals / Non-Goals

**Goals:**
- Mandatory explicit targeting: every team message must have `@all` or at least one `@member`
- Multi-mention: `@agent1 @agent2 rest of message` fans out to exactly those agents
- Rich autocomplete UI: typing `@` opens a member dropdown with filtering
- Mention chips: selected mentions render as visual tags in the composer
- Per-member slash commands: `/status @agentName`, `/abort @agentName` in team context
- Backend support: `mentions` parameter on envelope send for team-scoped targeted fan-out

**Non-Goals:**
- @mention outside team context (agent 1:1 chats don't need it)
- Mention notifications/badges (beyond existing unread system)
- @role or @subgroup targeting
- Mention history or analytics
- CLI `team send` changes (existing broadcast behavior preserved; `--to team:<name>:<agent>` already handles single targeting)

## Decisions

### 1. Mention parsing stays client-side with backend validation

**Decision**: The frontend parses `@mentions` from the message text and sends structured `mentions: string[]` to the backend. The backend validates that each mentioned name is a team member but does not parse message text.

**Rationale**: Keeps backend stateless w.r.t. message content. The frontend already does this via `resolveTeamRecipients()`. Backend validation prevents spoofed/invalid mention arrays.

**Alternative considered**: Backend parses mentions from text — rejected because it couples routing to text formatting and makes mention chips harder (chip-based UI removes mentions from visible text).

### 2. Mentions array replaces text-prefix parsing

**Decision**: Replace the current `@name prefix` text parsing with a structured `mentions` array sent alongside the message. The raw text no longer contains `@` prefixes — mentions are metadata, not content.

**Rationale**: Enables multi-mention cleanly. Mention chips in the UI are metadata — they shouldn't appear as raw text in the message body that agents receive. Agents see the message text without `@` noise; routing is determined by the `mentions` array.

**Alternative considered**: Keep `@` in text, parse multiple — rejected because it's fragile, agents see noisy text, and chips don't map cleanly to text prefixes.

### 3. `@all` is a reserved keyword, not a member name

**Decision**: `mentions: ["@all"]` is a special value meaning "broadcast to all members". The backend checks for this sentinel before member validation.

**Rationale**: Clean distinction between broadcast and targeted. `@all` cannot collide with agent names (agent names are alphanumeric + `._-`, but `@all` is never a valid agent name since `@` is not allowed in agent names).

### 4. Autocomplete dropdown architecture

**Decision**: Implement as a positioned popover anchored to the `@` cursor position in the textarea. Use a controlled list of team members filtered by typed characters after `@`. Arrow keys navigate, Enter/Tab inserts, Escape dismisses.

**Rationale**: Standard pattern (Slack, Discord, GitHub). Textarea cursor position tracking uses `getCaretCoordinates` helper. The popover renders above the textarea to avoid overlap with the keyboard on mobile.

**Alternative considered**: Replace textarea with contenteditable div for inline chips — rejected because contenteditable is notoriously buggy, and a chip bar above/below the textarea is simpler and more reliable.

### 5. Mention chips as a bar above the composer

**Decision**: Selected mentions render as removable chip/tag elements in a horizontal bar above the textarea, not inline in the text. The textarea contains only the message body.

**Rationale**: Cleanly separates targeting from content. Users can see exactly who will receive the message. Chips are removable with `×` buttons. This avoids contenteditable complexity.

### 6. Slash commands use mention chips for targeting

**Decision**: In team context, slash commands like `/status`, `/abort`, `/refresh` require an `@mention` target. The command picker appears when typing `/`, and after selecting a command, the user must specify a target via `@mention`. Commands execute against the targeted agent(s).

**Rationale**: Reuses the existing mention chip infrastructure. A single command can target multiple agents (e.g., `/status @agent1 @agent2`).

### 7. Backend API: `mentions` field on envelope send

**Decision**: Add optional `mentions: string[]` field to `POST /api/envelopes` for team-scoped sends. When `to` is `team:<name>` and `mentions` is provided:
- `["@all"]` → fan-out to all members
- `["agent1", "agent2"]` → fan-out only to listed members
- Empty array or missing field on team destination → rejected with 400

**Rationale**: Additive API change. CLI `team send` continues using existing `--to team:<name>` (broadcast) and `--to team:<name>:<agent>` (single target) without change.

### 8. Validation: at least one mention required for team sends from web

**Decision**: The frontend disables the send button until at least one mention chip is present. The backend also validates: team-scoped sends from console/web origin must include non-empty `mentions`.

**Rationale**: Defense in depth. UI prevents most cases; backend catches edge cases. CLI/agent sends are not affected (they use different code paths).

## Risks / Trade-offs

- **Breaking UX change**: Users accustomed to "just type and send" in team chat now must `@mention` first → Mitigation: `@all` shortcut is prominent in the UI; first-time hint in empty composer placeholder.
- **Multi-mention fan-out performance**: Sending to N agents creates N envelopes (existing pattern) → Mitigation: Existing best-effort fan-out handles this; team sizes are typically small (<20 agents).
- **Textarea caret positioning for autocomplete**: Cross-browser caret coordinate detection can be fragile → Mitigation: Use battle-tested `textarea-caret` npm utility or a lightweight inline implementation.
- **Mention chips occupy vertical space**: Reduces available composer area on small screens → Mitigation: Chip bar scrolls horizontally when many mentions are selected; `@all` is a single chip.
