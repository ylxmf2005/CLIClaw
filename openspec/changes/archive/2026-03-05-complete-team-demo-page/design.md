## Context

The `/demo` page has fully working agent chats (message list, composer, multi-chat) but the team chat is a stub — just a header and placeholder text. The live `TeamChatView` component already has the full implementation (message list, member panel, composer with @mention), but the demo version doesn't use it because it relies on the live `useAppState` + API calls.

## Goals / Non-Goals

**Goals:**
- Team demo chat shows real mock messages with multiple senders
- Member panel works (toggle, show status indicators)
- Demo composer shows @mention hint and placeholder
- Team entries in Chats tab show last message preview
- Consistent with existing demo patterns (mock data, demo reducer, no API calls)

**Non-Goals:**
- Working @mention autocomplete (just the placeholder text; real autocomplete is a live-mode feature)
- Sending messages in demo mode (read-only demo, same as agent chat demo)
- Team CRUD in demo (no create/edit/delete)

## Decisions

### 1. Reuse MessageList directly

The existing `MessageList` component is already generic — it renders envelopes with sender colors, boss badges, timestamps, and grouping. Team messages are just envelopes, so we reuse it directly in `DemoTeamChat` (same pattern as `DemoChatView`).

### 2. Mock data structure

Add team envelopes keyed by `team:<name>` in `MOCK_ENVELOPES`. Messages will come from different agents (nex, shieru, codex-worker) to show the multi-sender team chat experience. Include an @all broadcast and a couple of @mention messages.

### 3. Team entries in Chats tab

The `DemoChatList` already includes teams in the sorted entries list, but teams show `team.createdAt` as `lastMessageAt` since there are no messages. Once we add team envelopes, we'll also add `lastMessage` and `lastMessageAt` to team entries by computing them from mock envelopes.

### 4. Member panel in demo

Inline the member list from `state.teams[].members` + `state.agentStatuses` (same pattern as live `TeamChatView` but without the API call to `listTeamMembers`).

## Risks / Trade-offs

- [Minimal] Demo team chat won't have working send — this matches the existing agent chat demo behavior where the composer is just visual.
