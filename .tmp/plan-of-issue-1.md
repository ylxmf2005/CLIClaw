## Summary

Enhance the web frontend chat list panel with richer per-chat information, deletion, pinning, pagination, naming, and smoother switching UX. The current chat list shows raw UUID-based names, has no delete/pin capabilities, shows limited metadata per item, and provides jarring transitions when switching chats.

## Context & Motivation

The chat list (left panel under each agent) currently shows 15+ flat chat items with truncated UUID names like `console-chat-508954ac-5f5b-485e-9...`. Users cannot delete old chats, pin important ones, or see meaningful info at a glance. Switching chats is instant with no transition feedback, loses scroll position, and has no loading state.

**Branch base:** `feat/web-telegram-layout`
**Working branch:** `feat/chat-list-enhancements`

## Design

### 1. Rich Chat Item Display
Each chat item shows:
- **Label**: Auto-generated from first message (~40 chars), fallback to Chat #N
- **Last message preview**: First ~60 chars of most recent message (exists, wire through)
- **Relative timestamp**: "2m ago", "Yesterday", "Mar 3" (exists in ChatListItem, wire to nested agent view)
- **Message count**: Small 23 msgs badge
- **Adapter badge**: TG / WEB pill (exists in ChatListItem, wire through)
- **Status dot**: Agent running/idle/error state
- **Unread badge**: Already exists, keep as-is

### 2. Chat Auto-Naming & Rename
- **Auto-label**: On first user message, extract first ~40 chars as label. Store in ChatConversation.label
- **Rename**: Double-click on chat label to inline edit
- **Backend**: New `PATCH /api/agents/:name/sessions/:id` endpoint with `{ label: string }`

### 3. Chat Deletion
- **Hover delete icon**: Trash icon appears on right side on hover
- **Confirmation dialog**: Click trash then popover: "Delete this chat? This cannot be undone." with Cancel / Delete
- **Backend**: New `DELETE /api/agents/:name/sessions/:id` deletes session, bindings, and associated envelopes
- **Frontend**: Remove from state; if deleted chat was selected, navigate to next available or empty state

### 4. Pinning
- **Pin icon on hover**: Appears alongside trash icon on hover
- **Pinned section**: Pinned chats render at top of agent's chat list with a subtle pin indicator
- **Storage**: pinned flag in session metadata or new column in agent_sessions table
- Pinned chats persist across page reloads

### 5. Pagination (Show More)
- Default: Show latest **8 chats** per agent
- **"Show more" button** at bottom loads next batch
- Backend conversations API already supports limit/offset, wire to frontend

### 6. Chat Switching UX
- **Fade transition**: CSS transition (opacity + translateY) ~150ms when switching chat content
- **Loading skeleton**: Message skeleton placeholders when messages haven't loaded
- **Scroll position memory**: Map<chatKey, number> ref storing scroll position per chat. Restore on switch-back. Clear on chat delete.

### 7. Search (Future, out of scope)
- Agent-scoped and global search, deferred to follow-up issue

## Implementation Plan

### Milestone 1: Backend APIs
**Files:** src/daemon/http/routes-sessions.ts, src/daemon/db/database.ts, src/daemon/db/schema.ts

- [ ] **Task 1.1**: Add `PATCH /api/agents/:name/sessions/:id` for label update
- [ ] **Task 1.2**: Add `DELETE /api/agents/:name/sessions/:id` for session deletion
- [ ] **Task 1.3**: Add pinned column to agent_sessions + PATCH endpoint for pin/unpin

### Milestone 2: Chat Auto-Naming
**Files:** src/daemon/rpc/envelope-send-core.ts or src/daemon/rpc/session-chat-handlers.ts

- [ ] **Task 2.1**: Auto-label on first user message

### Milestone 3: Frontend Rich Chat Items
**Files:** web/src/components/chats/chat-list-item.tsx, web/src/components/chats/chat-list-panel.tsx, web/src/lib/types.ts

- [ ] **Task 3.1**: Update ChatListItem to display message count and ensure all metadata is wired
- [ ] **Task 3.2**: Update ChatListPanel to pass rich metadata from session API to ChatListItem

### Milestone 4: Frontend Delete & Pin
**Files:** web/src/components/chats/chat-list-item.tsx, web/src/components/chats/chat-list-panel.tsx

- [ ] **Task 4.1**: Add hover action icons (trash + pin) to ChatListItem
- [ ] **Task 4.2**: Add delete confirmation popover/dialog
- [ ] **Task 4.3**: Wire delete to DELETE endpoint, handle state removal + navigation
- [ ] **Task 4.4**: Wire pin to backend, render pinned section at top
- [ ] **Task 4.5**: Add inline rename (double-click label to input) + wire to PATCH endpoint

### Milestone 5: Frontend Pagination
**Files:** web/src/components/chats/chat-list-panel.tsx

- [ ] **Task 5.1**: Limit initial fetch to 8 chats, add "Show more" button
- [ ] **Task 5.2**: Implement incremental loading with offset

### Milestone 6: Frontend Chat Switching UX
**Files:** web/src/app/(app)/agents/[name]/[chatId]/page.tsx, web/src/components/chat/message-list.tsx

- [ ] **Task 6.1**: Add CSS fade transition on chat content switch
- [ ] **Task 6.2**: Add loading skeleton when messages are being fetched
- [ ] **Task 6.3**: Implement scroll position memory

## Key Files

| File | Role |
|------|------|
| web/src/components/chats/chat-list-item.tsx | Chat item component |
| web/src/components/chats/chat-list-panel.tsx | Chat list container |
| src/daemon/http/routes-sessions.ts | Session HTTP routes |
| src/daemon/db/database.ts | Database operations |
| src/daemon/db/schema.ts | Schema definitions |
| web/src/app/(app)/agents/[name]/[chatId]/page.tsx | Chat page |
| web/src/components/chat/message-list.tsx | Message list component |

## Testing Strategy

- Backend: Unit tests for new DB methods (delete cascade, pin toggle, label update)
- Frontend: Manual E2E verification
- Edge cases: Delete selected chat, delete last chat, pin/unpin while paginated, rename empty label

## Acceptance Criteria

- [ ] Each chat item shows: label, last message, timestamp, message count, adapter badge, status
- [ ] Hover reveals trash + pin icons; delete shows confirmation; pin moves chat to top
- [ ] Double-click label enables inline rename
- [ ] Only 8 chats shown initially; "Show more" loads next batch
- [ ] Chat switch has fade transition, loading skeleton, and remembers scroll position
- [ ] Backend has DELETE, PATCH (label), PATCH (pin) endpoints for sessions

