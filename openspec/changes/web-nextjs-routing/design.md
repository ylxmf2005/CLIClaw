## Context

The Hi-Boss web frontend uses Next.js 16 with App Router but currently renders as a single-page app: one `page.tsx` at `/` with `AppShell` switching views via `state.view` reducer state. Meanwhile, a set of demo UI components in `src/app/demo/` were carefully designed with the correct Telegram-style layout but are only used at `/demo` with mock data. The live app rebuilt everything from scratch in `src/components/`, ignoring the demo designs.

The demo components use `useDemoContext()` for state and mock data. The live components use `useAppState()` with real API data. The goal is to bridge these: adapt the demo UI for real data, use Next.js routing properly, and fill gaps where the demo is missing features that the SPA or backend already supports.

**Key constraint**: Demo files are additive-only — no deletions or breaking changes to existing demo code.

## Goals / Non-Goals

**Goals:**
- Use Next.js App Router file-based routing for all views
- URLs reflect current state: `/agents/nex/pr-review`, `/teams/research`, `/admin`
- Browser back/forward navigation works naturally
- Demo UI components are the design source — real components follow their patterns
- **Enhance demo with missing SPA features** (chat header controls, agent CRUD, scheduled envelopes, etc.)
- Demo directory is preserved (additive changes only)
- Providers (Auth, WS, AppState, Theme) wrap all routes via `layout.tsx`
- Left panel persists across route changes (layout-level)

**Non-Goals:**
- Server-side rendering of chat data (all pages remain `"use client"`)
- Changing the REST API or WebSocket protocol
- Adding xterm.js terminal integration (separate follow-up)
- Full cron CRUD forms (display + enable/disable toggle only in this change)

## Decisions

### 1. Route Structure

```
web/src/app/
  layout.tsx              # Root: html/body, ThemeProvider, TooltipProvider
  (app)/                  # Route group: auth-gated, provides WS + AppState
    layout.tsx            # Auth guard (renders LoginScreen if unauthed), WS/AppState providers, left panel + main area
    page.tsx              # / → empty state ("Select a conversation")
    not-found.tsx         # 404 → empty state with "Page not found"
    agents/
      [name]/
        page.tsx          # /agents/nex → redirects to /agents/nex/default
        [chatId]/
          page.tsx        # /agents/nex/pr-review → chat view + split panes
    teams/
      [name]/
        page.tsx          # /teams/research → team chat
    admin/
      page.tsx            # /admin → daemon status dashboard
  demo/                   # Preserved as-is (additive only)
    page.tsx              # /demo → self-contained demo
```

**Login placement**: `(app)/layout.tsx` conditionally renders `LoginScreen` when unauthenticated. The URL stays unchanged, so after login the route naturally renders the correct page. This preserves deep-link URLs.

**404 handling**: `(app)/not-found.tsx` shows a styled empty state. Individual pages validate agent/team existence and show "not found" inline if needed.

### 2. Component Strategy: Enhance Demo, Then Adapt

**Phase 1 — Enhance demo**: Add missing UI features to the demo components (additive only). This includes:
- **Slash commands in composer** with autocomplete popup (replaces icon buttons in chat header). Commands: `/interrupt`, `/abort`, `/refresh`, `/terminal`, `/cron`, `/relay`, `/thread`, `/details`
- **Agent management separated from chat**: Agent settings only accessible via gear icon in Agents tab → dialog. Chat view stays clean (minimal header, no agent management).
- Agent CRUD (create modal, settings dialog with edit form) in Agents tab only
- Scheduled envelopes display
- Reply preview component
- Composer: schedule send support (already in shared MessageComposer)

**Phase 2 — Adapt for real data**: Create route page components that follow the enhanced demo's visual structure but use `useAppState()` + real API calls instead of `useDemoContext()` + mock data.

This two-phase approach ensures the demo remains the single source of truth for UI design.

### 3. State Management Changes

Remove URL-derived fields from `AppStateProvider` reducer:
- `view` → derived from pathname
- `selectedChat` → derived from `[name]` + `[chatId]` route params
- `selectedTeam` → derived from `[name]` route param
- `activeTab` → derived from pathname via `useActiveTab()` hook

Retain in reducer: `agents`, `agentStatuses`, `agentLogLines`, `envelopes`, `conversations`, `teams`, `cronSchedules`, `daemonStatus`, `drafts`, `relayStates`, `ptyOutput`.

**`splitPane`**: Local component state within the chat page (ephemeral — closes on navigation).

**Unread count reset**: The chat page component dispatches `UPDATE_UNREAD` with delta=0 reset on mount/param change, replacing the old `SELECT_CHAT` side effect.

**Conversations structure**: The demo uses flat `ChatConversation[]`. The real AppState uses `Record<string, ChatConversation[]>` keyed by agent name. Route pages will flatten when needed for display.

### 4. Navigation Model

Left panel uses `next/link` or `router.push()`:
- Click agent conversation → `router.push(/agents/${name}/${chatId})`
- Click team → `router.push(/teams/${name})`
- Settings → Daemon Status → `router.push(/admin)`

**Tab auto-switching**: When navigating via URL, the left panel's active tab auto-derives from the pathname:
- `/agents/*` → "chats" tab (shows conversation list)
- `/teams/*` → "chats" tab (teams appear in mixed chat list)
- `/admin` → "settings" tab
- Can be overridden by user clicking a different tab

**Active item highlighting**: `useParams()` in the layout provides current agent/team/chatId. The left panel highlights the matching item regardless of which tab is active.

### 5. Modal Placement

After `AppShell` removal, modals (AgentCreateModal, team create modal) move to `(app)/layout.tsx`. They're triggered by callbacks passed to the left panel's "+" buttons.

### 6. Demo Preservation

Demo files are **additive-only**:
- New features are added as new components or new optional props
- Existing demo behavior is never broken
- `mock-data.ts` can gain new entries but existing entries stay unchanged
- Shared components (`MessageComposer`, `ChatListItem`, `MessageContent`) remain backward-compatible

## Risks / Trade-offs

- **Split pane state lost on navigation**: Acceptable for ephemeral panels. Could use URL search params later.
- **Two-phase approach increases scope**: Enhancing demo first adds work, but ensures the demo stays canonical.
- **Conversations data structure difference**: Demo (flat) vs live (keyed) requires mapping. Each route page handles this.
- **Login renders inside `(app)` layout**: The layout must handle two rendering modes. Minor complexity.
