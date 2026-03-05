## 1. Mock Data

- [x] 1.1 Add team envelopes to `MOCK_ENVELOPES` in `mock-data.ts` keyed by `team:core-dev` with 6 messages from nex, shieru, codex-worker — include an @all broadcast and @mention messages
- [x] 1.2 Add team metadata (lastMessage, lastMessageAt) to `MOCK_TEAMS` in `mock-data.ts` computed from the last team envelope

## 2. Demo Team Chat View

- [x] 2.1 Rewrite `demo-team-chat.tsx` to render team messages using the same message rendering pattern as `DemoChatView`
- [x] 2.2 Add toggleable member panel showing team members with status indicators from `MOCK_AGENT_STATUSES`
- [x] 2.3 Add demo composer with @mention placeholder text (read-only, matching existing demo chat pattern)

## 3. Chat List Integration

- [x] 3.1 Verify team entries in Chats tab show last message preview and sort by recency (updated `demo-left-panel.tsx` to pull lastMessage from team metadata)
