## Why

Team chat currently defaults to broadcast-all when no `@mention` is present, making it impossible to distinguish intentional broadcasts from accidental ones. The `@mention` system only supports single-agent targeting (`@agentName`) with no multi-mention, no autocomplete UI, and no per-member slash commands. This limits team chat's usefulness as a coordination tool -- bosses need fine-grained control over who receives each message, with an enterprise-quality UX that prevents misfires and makes targeting obvious.

## What Changes

- **Mandatory mention requirement**: Every team message must explicitly target at least one member (`@agentName`) or use `@all` for broadcast. Messages without a valid mention cannot be sent.
- **Multi-mention support**: Support `@agent1 @agent2 message` to target multiple specific members in a single send. Backend fans out only to mentioned agents.
- **@mention autocomplete UI**: Typing `@` in the team composer opens a filtered dropdown of team members. Arrow keys navigate, Enter/Tab selects. Selected mentions render as styled chips/tags in the composer.
- **Slash commands in team context**: Support `/command @agentName` to send a slash command (e.g., `/status`, `/abort`, `/refresh`) targeting a specific team member. The command picker integrates with the @mention system.
- **@all broadcast**: `@all` targets all team members (existing behavior, now required explicitly).
- **Backend multi-mention fan-out**: `envelope.send` with `to: team:<name>` supports a new `mentions` field to specify targeted recipients instead of full broadcast.

## Capabilities

### New Capabilities
- `team-mentions`: @mention parsing, multi-mention resolution, mention validation, and autocomplete UI for team chat composer

### Modified Capabilities
- `envelope`: Add `mentions` field to team-scoped envelope sends for targeted fan-out (subset of members instead of all)
- `team`: Team send supports targeted multi-member fan-out via mentions; mandatory mention validation
- `web-frontend`: Team chat composer with @mention autocomplete, mention chips, slash command integration, mandatory mention gate

## Impact

- **Backend RPC**: `envelope-send-core.ts` needs to accept and validate `mentions` array for team destinations. `team-handlers.ts` `team.send` needs `mentions` support.
- **Frontend**: `message-composer.tsx` needs @mention autocomplete overlay, chip rendering, and mention extraction. `teams/[name]/page.tsx` needs send-gate logic.
- **Shared**: `team-mentions.ts` needs multi-mention parsing and validation.
- **API**: `POST /api/envelopes` body gains optional `mentions` field for team-scoped sends.
- **No breaking changes**: Existing CLI `team send` continues to broadcast; `mentions` is additive.
