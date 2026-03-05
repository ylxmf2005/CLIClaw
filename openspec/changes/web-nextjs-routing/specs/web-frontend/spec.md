## MODIFIED Requirements

### Requirement: Frontend Structure

The web frontend SHALL use Next.js App Router file-based routing for all views. The directory structure SHALL be:

```
web/src/app/
  layout.tsx              # Root: html, body, ThemeProvider, TooltipProvider
  (app)/                  # Route group for auth-gated app
    layout.tsx            # Auth guard, WS/AppState providers, left panel, modals
    page.tsx              # Empty state
    not-found.tsx         # 404 page
    agents/[name]/
      page.tsx            # Agent default → redirect to default chatId
      [chatId]/page.tsx   # Agent chat view with split panes
    teams/[name]/
      page.tsx            # Team chat view
    admin/page.tsx        # Daemon status dashboard
  demo/                   # Static demo (preserved, additive changes only)
```

The `(app)` route group SHALL provide authentication gating, WebSocket connection, and app state to all nested routes without affecting URL paths. The `(app)/layout.tsx` SHALL render `LoginScreen` conditionally when the user is not authenticated, preserving the current URL for deep-link support.

#### Scenario: Agent chat URL
- **WHEN** user navigates to `/agents/nex/pr-review`
- **THEN** the app renders the chat view for agent "nex", chat "pr-review", with left panel visible

#### Scenario: Team chat URL
- **WHEN** user navigates to `/teams/research`
- **THEN** the app renders the team chat view for team "research", with left panel visible

#### Scenario: Admin URL
- **WHEN** user navigates to `/admin`
- **THEN** the app renders the daemon status dashboard

#### Scenario: Root URL
- **WHEN** user navigates to `/`
- **THEN** the app renders the left panel with an empty state prompt ("Select a conversation")

#### Scenario: Demo preserved
- **WHEN** user navigates to `/demo`
- **THEN** the demo page renders with mock data, identical to its current behavior plus any additive enhancements

#### Scenario: Deep link while unauthenticated
- **WHEN** an unauthenticated user navigates to `/agents/nex/pr-review`
- **THEN** the login screen is shown at that URL, and after successful login the chat view renders without a redirect

#### Scenario: 404 route
- **WHEN** user navigates to `/nonexistent`
- **THEN** the app renders a styled "Page not found" empty state within the app layout

#### Scenario: Agent redirect
- **WHEN** user navigates to `/agents/nex` (no chatId)
- **THEN** the app redirects to `/agents/nex/default`

### Requirement: UI Layout

The frontend SHALL use a Telegram-style layout with a persistent left panel (320px) containing a bottom tab bar. The left panel SHALL be rendered in the `(app)/layout.tsx` and persist across all route navigations. The main content area SHALL be filled by the current route's page component.

The left panel bottom tabs (Agents, Teams, Chats, Settings) SHALL control which list is shown in the left panel. Tab selection SHALL NOT change the URL or the main content area. However, when navigating via URL, the active tab SHALL auto-derive from the pathname (`/agents/*` or `/teams/*` → Chats, `/admin` → Settings).

Modals (AgentCreateModal, team create) SHALL be hosted in `(app)/layout.tsx` and triggered from left panel "+" buttons.

#### Scenario: Tab switch preserves main content
- **WHEN** user is viewing `/agents/nex/default` and switches the bottom tab from "Chats" to "Agents"
- **THEN** the left panel shows the agent list, but the main content area continues to show the nex/default chat

#### Scenario: Navigation from left panel
- **WHEN** user clicks an agent conversation in the left panel
- **THEN** the browser URL changes to `/agents/{name}/{chatId}` and the main content area shows the corresponding chat view

#### Scenario: Tab auto-switch on deep link
- **WHEN** user navigates directly to `/teams/research`
- **THEN** the left panel's active tab switches to "Chats" and highlights the research team

#### Scenario: Active item highlighting across tabs
- **WHEN** the URL is `/agents/nex/pr-review` and the user is on any tab
- **THEN** if the Chats tab is shown, the nex/pr-review entry is highlighted

### Requirement: State Management

The `AppStateProvider` reducer SHALL NOT store URL-derived state (`view`, `selectedChat`, `selectedTeam`, `activeTab`). These values SHALL be derived from the current URL path using `useParams()` and `usePathname()` hooks via `useRouteSelection()` and `useActiveTab()`.

The `splitPane` state SHALL be local to the chat page component (not in the reducer). It is ephemeral and resets on navigation.

The reducer SHALL continue to manage: agents, agentStatuses, agentLogLines, envelopes, conversations, teams, cronSchedules, daemonStatus, drafts, relayStates, ptyOutput.

#### Scenario: Chat selection from URL
- **WHEN** the URL is `/agents/nex/pr-review`
- **THEN** the agent name "nex" and chat ID "pr-review" are available to components via route params, not reducer state

#### Scenario: Unread count reset on navigation
- **WHEN** user navigates to `/agents/nex/pr-review` which has unread messages
- **THEN** the chat page component dispatches an unread-reset action on mount, clearing the badge

#### Scenario: State persists across navigation
- **WHEN** user navigates from `/agents/nex/default` to `/teams/research` and back
- **THEN** previously loaded envelopes for agent:nex:default are still in the reducer

#### Scenario: Logout clears state and navigates
- **WHEN** user clicks "Disconnect" in the settings panel
- **THEN** auth state is cleared, WebSocket is closed, and the login screen appears at the current URL

### Requirement: Demo UI as Design Reference

Real (live-data) components SHALL follow the visual structure and design patterns established by the demo components. Demo files SHALL be enhanced with missing SPA features (additive only) before being used as the reference for live components.

Demo enhancements SHALL include:
- Chat header controls (interrupt, relay, refresh, abort, agent details)
- Agent create modal and agent detail sheet
- Scheduled envelopes display above messages
- Reply preview bar above composer
- Settings panel connection status styling

Demo files SHALL be preserved with additive changes only — no deletions or breaking modifications to existing demo code. Shared components SHALL remain backward-compatible.

#### Scenario: Demo unchanged baseline
- **WHEN** this change is complete
- **THEN** all existing demo functionality at `/demo` works identically, with additional new features visible

#### Scenario: Visual consistency
- **WHEN** the live chat view for an agent is rendered
- **THEN** its header, message list, log preview, and composer layout SHALL match the enhanced demo chat view's structure

#### Scenario: Demo chat header enhanced
- **WHEN** viewing an agent chat in the demo
- **THEN** the header shows interrupt toggle, relay toggle, refresh button, and agent details button alongside existing New Chat, Terminal, and Cron buttons
