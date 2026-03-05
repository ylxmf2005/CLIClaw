## 1. Shared: Multi-mention parsing & validation

- [x] 1.1 Rewrite `web/src/lib/team-mentions.ts` to support multi-mention resolution: parse `mentions: string[]` input, validate against member list, handle `@all` sentinel, return `{ kind, recipients, text }`. Add unit tests in `web/src/lib/team-mentions.test.ts`.
- [x] 1.2 Add `mentions` field to the envelope send params type in `web/src/lib/types.ts` and `web/src/lib/api.ts` (API client).

## 2. Backend: Mentions-aware team fan-out

- [x] 2.1 Add `mentions?: string[]` parameter to `sendEnvelopeFromBoss()` in `src/daemon/rpc/envelope-send-core.ts`. When `to` is a team address and `mentions` is provided: validate each name against team members, fan-out only to listed members (or all if `["@all"]`). Stamp `metadata.mentions` on each created envelope.
- [x] 2.2 Update `POST /api/envelopes` route in `src/daemon/http/routes-sessions.ts` (or the relevant routes file) to pass `mentions` from request body to the RPC handler.
- [x] 2.3 Add validation: when origin is `console` and destination is a team address, reject if `mentions` is empty/missing with a 400 error. CLI and agent origins remain backward-compatible (no mentions required).
- [x] 2.4 Add backend tests for mentions validation and targeted fan-out in `src/daemon/rpc/envelope-handlers.test.ts`.

## 3. Frontend: Mention bar & chip component

- [x] 3.1 Create `web/src/components/chat/mention-bar.tsx`: a horizontal bar above the composer textarea that renders mention chips. Props: `mentions: string[]`, `onRemove(name)`, `onTriggerAutocomplete()`, `teamMembers: string[]`. Shows hint text when empty.
- [x] 3.2 Create `web/src/components/chat/mention-chip.tsx`: a styled chip with member name and `x` remove button. `@all` chip gets distinct accent styling.
- [x] 3.3 Implement @all / individual mention mutual exclusivity logic in the mention bar state: selecting `@all` clears individuals, selecting an individual clears `@all`.

## 4. Frontend: @mention autocomplete dropdown

- [x] 4.1 Create `web/src/components/chat/mention-autocomplete.tsx`: a positioned dropdown listing `@all` (first) + unmentioned team members. Props: `members: string[]`, `currentMentions: string[]`, `filter: string`, `onSelect(name)`, `onDismiss()`, `anchorRect`. Supports keyboard navigation (arrow, enter/tab, escape).
- [x] 4.2 Integrate autocomplete trigger in `message-composer.tsx`: detect `@` typed in textarea, compute caret position, show autocomplete dropdown. On select, add to mention bar and clear `@...` text from textarea.
- [x] 4.3 Add `@` button to mention bar that opens autocomplete dropdown without requiring textarea typing.

## 5. Frontend: Send gate & message dispatch

- [x] 5.1 Update `message-composer.tsx` to accept `teamMode` props: `teamMembers: string[]`, `mentions: string[]`, `onMentionsChange(mentions)`. In team mode, disable send button when mentions is empty.
- [x] 5.2 Update `teams/[name]/page.tsx` send handler: pass `mentions` array to `api.sendEnvelope()` instead of the old `resolveTeamRecipients` text-prefix logic. Remove old text-prefix @mention code.
- [x] 5.3 Clear mention chips and textarea after successful send.

## 6. Frontend: Team slash commands

- [x] 6.1 Define team-specific slash commands in the composer: `/status`, `/abort`, `/refresh`, `/interrupt`. These commands use the current mention targets.
- [x] 6.2 Implement slash command execution in `teams/[name]/page.tsx`: when a slash command is submitted, call the appropriate agent API endpoint (e.g., `api.getAgentStatus()`, `api.abortAgent()`, `api.refreshAgent()`) for each mentioned agent. Display results inline or as toast.
- [x] 6.3 Allow slash commands to execute without text body (mention chips are the only required input for commands).

## 7. Demo: Update demo team chat

- [x] 7.1 Update demo team chat composer to show a non-interactive mention bar with hint text matching the live design. Add mock `@all` and `@nex` chips for visual reference.

## 8. Integration testing

- [x] 8.1 E2E test: send a team message with `@all` from the web UI, verify all members receive envelopes.
- [x] 8.2 E2E test: send a team message with `@nex` only, verify only `nex` receives the envelope and other members do not.
- [x] 8.3 E2E test: verify send button is disabled when no mentions are selected, enabled when at least one is present.
