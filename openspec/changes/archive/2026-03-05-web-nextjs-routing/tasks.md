## 1. Enhance Demo UI (Additive Only)

- [x] 1.1 Add chat header controls to `demo-chat-view.tsx`: relay on/off toggle (UI switch), terminal button, cron button. Slash commands (`/interrupt`, `/abort`, `/refresh`) handled via composer autocomplete — NOT as header icon buttons. Provider badge next to agent name. Agent management stays in Agents tab only (gear icon → dialog), NOT in chat header.
- [x] 1.2 Create `demo-agent-detail-sheet.tsx`: agent info display (provider, model, workspace, permission, relay mode, last seen, session policy), run status, binding list. Wire into demo via new action/state. Uses existing `Sheet` component from shadcn/ui.
- [x] 1.3 Add agent create button to demo left panel (Agents tab header "+" button). Create `demo-agent-create.tsx` with form: name, description, provider select, workspace path. Wire as mock action (adds to demo state).
- [x] 1.4 Add scheduled envelopes display to `demo-chat-view.tsx`: show pending envelopes above message list with amber-pulse styling. Add mock scheduled envelopes to `mock-data.ts`.
- [x] 1.5 Add reply-to-message interaction: hover action on messages in `demo-chat-view.tsx`, reply preview bar above composer. Add `replyToEnvelopeId` support to `ADD_ENVELOPE` demo action.
- [x] 1.6 Enhance demo settings panel: show WebSocket status indicator with icon (Wifi/WifiOff), "Connected (demo)" label with styled border.

## 2. Route Structure Setup

- [x] 2.1 Create `(app)/layout.tsx`: wraps children with AuthProvider → conditional LoginScreen or (WebSocketProvider → AppStateProvider → left panel + main area). Mark `"use client"`. Left panel rendered here with modal hosts (AgentCreateModal, team create).
- [x] 2.2 Create `(app)/page.tsx`: empty state ("Select a conversation to begin"), matching demo's empty state design.
- [x] 2.3 Create `(app)/not-found.tsx`: styled empty state with "Page not found" message.
- [x] 2.4 Create `(app)/agents/[name]/page.tsx`: reads `name` param, loads conversations, redirects to `/agents/{name}/default`.
- [x] 2.5 Create `(app)/agents/[name]/[chatId]/page.tsx`: renders agent chat view (adapted from enhanced demo), loads envelopes, handles split panes with local state, includes resizable drag handle.
- [x] 2.6 Create `(app)/teams/[name]/page.tsx`: renders team chat view (adapted from enhanced demo), loads team envelopes.
- [x] 2.7 Create `(app)/admin/page.tsx`: renders daemon status dashboard (adapted from demo).
- [x] 2.8 Update root `app/page.tsx` and `app/layout.tsx`: root layout provides ThemeProvider + TooltipProvider only. Root page redirects to `(app)` or is removed if `(app)` handles `/` directly.

## 3. State Management & Hooks

- [x] 3.1 Create `useRouteSelection()` hook: derives `agentName`, `chatId`, `teamName`, and `activeView` from `useParams()` + `usePathname()`.
- [x] 3.2 Create `useActiveTab()` hook: derives left panel active tab from URL pathname (`/agents/*` or `/teams/*` → "chats", `/admin` → "settings"). Allow local override when user clicks a different tab.
- [x] 3.3 Remove `view`, `selectedChat`, `selectedTeam`, `activeTab` from AppStateProvider reducer. Remove `SET_VIEW`, `SELECT_CHAT`, `SELECT_TEAM`, `SET_TAB` actions. Move unread-reset logic into chat page's `useEffect` (dispatch `UPDATE_UNREAD` on mount). *Note: fields kept as deprecated in reducer until old SPA components are removed in 6.x; new route pages use URL hooks; UPDATE_UNREAD with delta=0 resets to 0.*
- [x] 3.4 Remove `splitPane` from reducer (becomes local state in chat page). Keep `loading` for initial data load. *Note: field kept in reducer until old components removed in 6.x; new chat page uses local state.*

## 4. Left Panel Adaptation (Live Data)

- [x] 4.1 Build live `LeftPanel` following enhanced demo's visual structure: header (CLIClaw + connection status), tab content areas, bottom tab bar. Uses `useAppState()` for data, `useRouter()` for navigation, `useRouteSelection()` for active item highlighting.
- [x] 4.2 Chat list (Chats tab): sorted conversation + team entries via `ChatListItem`. Click → `router.push()`. Highlight based on route params.
- [x] 4.3 Agent list (Agents tab): agents with expandable conversation sub-lists, status indicators, log line preview. "+" button triggers AgentCreateModal. "New chat" per agent.
- [x] 4.4 Team list (Teams tab): team entries with member count. "+" button triggers team create.
- [x] 4.5 Settings panel: connection status from WS provider, dark mode toggle, daemon status link → `router.push("/admin")`, disconnect/logout → clear auth + navigate to `/`.

## 5. Route Page Implementations (Live Data)

- [x] 5.1 Agent chat page: follow enhanced demo chat view layout — header (status, name, label, provider, interrupt/relay/refresh/abort/details), scheduled envelopes, message list, log preview, reply preview, composer. Wire to real `sendEnvelope()`, `loadEnvelopes()`, `abortAgent()`, `refreshAgent()`, `toggleRelay()`.
- [x] 5.2 Agent chat split panes: local `splitPane` state, resizable drag handle (port from `app-shell.tsx`), renders terminal or cron panel.
- [x] 5.3 Team chat page: follow demo team chat layout — header, messages with per-agent terminal buttons, member panel toggle, composer. Wire to real `sendEnvelope()` with `to: "team:..."`.
- [x] 5.4 Admin page: follow demo daemon status layout — connection banner, stat cards. Wire to real `daemonStatus` from state.

## 6. Cleanup & Verification

- [x] 6.1 Remove old `AppShell` (`components/layout/app-shell.tsx`) and the SPA `app/page.tsx` that rendered it.
- [x] 6.2 Remove or consolidate duplicated components under `src/components/layout/left-panel.tsx` and other files that were built for the SPA approach.
- [x] 6.3 Verify demo still works at `/demo` — no regressions, all new additions functional with mock data.
- [x] 6.4 E2E test: login → navigate agents → send message → switch tabs → navigate teams → admin → browser back/forward → deep link while logged out → verify all routes work, unread badges clear, split panes open/close, modals open from left panel.
