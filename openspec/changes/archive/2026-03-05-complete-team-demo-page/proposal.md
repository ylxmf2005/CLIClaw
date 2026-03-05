## Why

The web frontend demo page (`/demo`) has fully functional agent chat views with mock data, but the team chat view is a placeholder stub — it shows a header with team name/member count and an empty "group chat for X" message, with no actual messages or working composer. To demonstrate the full frontend, the team demo needs parity with the agent chat demo.

## What Changes

- Add mock team envelopes to `mock-data.ts` (team messages with @mentions, @all, multiple senders)
- Rewrite `demo-team-chat.tsx` to render real messages using `MessageList`, add a working member panel, and a demo-mode composer with @mention autocomplete
- Add team conversations to `MOCK_CONVERSATIONS` so teams appear in the Chats tab sorted by recency
- Wire the left panel's Teams tab to show team chat entries in the chat list

## Capabilities

### New Capabilities

(none — this enhances the existing `web-frontend` capability)

### Modified Capabilities

- `web-frontend`: Adding team group chat demo with messages, member panel, and @mention composer to the demo page

## Impact

- `web/src/app/demo/demo-team-chat.tsx` — rewritten
- `web/src/app/demo/mock-data.ts` — new team envelope data + team conversations
- `web/src/app/demo/demo-left-panel.tsx` — may need team chat entries in Chats tab
- No daemon or backend changes
