## Why

The web frontend currently renders all views in a single `page.tsx` using JS state (`state.view`) to switch between chat, team, admin, and settings views. This ignores Next.js App Router's file-based routing — no URL navigation, no browser history, no deep linking. Additionally, a complete set of demo UI components (`demo-left-panel`, `demo-chat-view`, `demo-team-chat`, etc.) was designed and built but then ignored during the live-data integration; instead, entirely new components were written from scratch under `src/components/`. The demo UI should be the canonical design reference and the basis for the real app.

## What Changes

- **Replace SPA-style view switching with Next.js file-based routing**: Create route segments for agents/chat (`/agents/[name]/[chatId]`), teams (`/teams/[name]`), admin (`/admin`), etc. Navigation uses `next/link` and `useRouter` instead of `dispatch({ type: "SET_VIEW" })`.
- **Shared layout via `layout.tsx`**: Auth, WS, and AppState providers wrap all routes. The left panel (sidebar + bottom tab bar) lives in the layout, with the main content area rendered by the route's `page.tsx`.
- **Adapt demo UI components for live data**: The demo components (`DemoLeftPanel`, `DemoChatView`, `DemoTeamChat`, `DemoDaemonStatus`, `DemoTerminal`, `DemoCronPanel`) become the basis for the real components. Replace `useDemoContext()` → `useAppState()`, mock data → API calls. Demo files themselves are preserved (only additions allowed, no deletions).
- **Remove the monolithic `AppShell`**: The `app-shell.tsx` that does state-driven routing is replaced by the Next.js router itself. The split-pane logic (terminal, cron) moves to the chat route layout or component level.
- **URL-driven state**: `selectedChat`, `selectedTeam`, and `view` are derived from the URL params, not from reducer state.

## Capabilities

### New Capabilities

_None — this is a structural refactor of existing frontend capabilities._

### Modified Capabilities

- `web-frontend`: Routing model changes from SPA state-driven to Next.js file-based routing. Demo UI components become the canonical design source for live components. Layout structure changes to use Next.js layouts.

## Impact

- **Frontend code**: Major restructure of `web/src/app/` directory (new route segments), adaptation of `web/src/app/demo/` components into real data-driven versions, removal of `AppShell` monolith and state-driven view switching.
- **State management**: `AppStateProvider` reducer loses `view`, `selectedChat`, `selectedTeam`, `activeTab` fields (these become URL-derived). Core data state (agents, envelopes, conversations, WS events) is preserved.
- **Demo**: Preserved as-is (additive changes only). Demo continues to work at `/demo` with mock data.
- **Backend**: No changes. All existing REST API and WebSocket endpoints remain as-is.
- **No breaking changes to user-facing behavior** — the web console retains the same Telegram-style layout, just with proper URL routing.
