# Web NextJS Routing E2E Test Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify all web-nextjs-routing features work end-to-end against a live daemon via browser testing.

**Architecture:** Use chrome-devtools MCP to drive a real browser session against the Next.js dev server (localhost:3000) backed by a live daemon (localhost:3889, data dir ~/hiboss-test/). Each task tests one feature area by navigating, interacting, and verifying DOM state via a11y snapshots and screenshots.

**Tech Stack:** Chrome DevTools Protocol (via MCP), Next.js 16 dev server, Hi-Boss daemon HTTP+WS, SQLite test data.

**Test Environment:**
- Next.js dev server: `http://localhost:3000`
- Daemon HTTP+WS: `http://localhost:3889`
- Admin token: `aabbccdd11223344aabbccdd11223344`
- Existing agent: `nex` (provider: claude)
- No teams exist yet (Task 1 creates test data)

---

### Task 1: Set Up Test Data

Create a team and cron schedule so all route pages have data to display.

**Step 1: Create a test team via daemon API**

```bash
TOKEN="aabbccdd11223344aabbccdd11223344"
curl -s -X POST http://localhost:3889/api/teams \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"research","description":"Research team for testing"}'
```

Expected: `{"name":"research",...}` or success response.

**Step 2: Add agent nex to the research team**

```bash
curl -s -X POST http://localhost:3889/api/teams/research/members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentName":"nex"}'
```

Expected: success response.

**Step 3: Create a cron schedule for agent nex**

```bash
curl -s -X POST http://localhost:3889/api/cron \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"agent:nex","cron":"0 9 * * *","text":"Daily standup check","enabled":true}'
```

Expected: cron schedule created with an id.

**Step 4: Verify test data exists**

```bash
curl -s http://localhost:3889/api/teams -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s http://localhost:3889/api/cron -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: team "research" with 1 member, 1 active cron schedule.

---

### Task 2: Login Flow

**Step 1: Navigate to the app root**

Use `mcp__chrome-devtools__navigate_page` to go to `http://localhost:3000`.

**Step 2: Take a snapshot and verify login screen is shown**

Use `mcp__chrome-devtools__take_snapshot`. Expected: page shows a login screen with a token input field and a submit/login button. Look for elements like "token", "login", "sign in", or "connect".

**Step 3: Enter the admin token**

Use `mcp__chrome-devtools__fill` to enter `aabbccdd11223344aabbccdd11223344` into the token input field (find uid from snapshot).

**Step 4: Submit login**

Use `mcp__chrome-devtools__click` on the login/submit button, or `mcp__chrome-devtools__press_key` with `Enter`.

**Step 5: Verify authenticated state**

Use `mcp__chrome-devtools__take_snapshot`. Expected: Left panel is visible with "Hi-Boss" header, "Connected" status, bottom tab bar (Agents, Teams, Chats, Settings), and main content shows empty state ("Select a conversation to begin").

**Step 6: Take a screenshot for visual verification**

Use `mcp__chrome-devtools__take_screenshot` to capture the authenticated home state.

---

### Task 3: Left Panel - Chats Tab & Agent Navigation

**Step 1: Verify the Chats tab is active by default**

From the snapshot in Task 2 Step 5, confirm "Chats" tab is selected (aria-selected=true).

**Step 2: Click on the Agents tab**

Use `mcp__chrome-devtools__click` on the "Agents" tab button.

**Step 3: Verify agent list shows nex**

Use `mcp__chrome-devtools__take_snapshot`. Expected: agent "nex" appears with status indicator and provider info.

**Step 4: Click on agent nex to expand conversations**

Use `mcp__chrome-devtools__click` on the nex agent entry. If it has conversations, it should expand to show them. If no conversations, it should navigate to `/agents/nex/default`.

**Step 5: Verify URL changed to /agents/nex/default**

Use `mcp__chrome-devtools__take_snapshot`. Check the page content - should show agent chat view with header "nex", relay toggle, terminal button, cron button, and message composer.

**Step 6: Take a screenshot of the agent chat view**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 4: Agent Chat View - Header Controls

**Step 1: Verify header elements from snapshot**

From the agent chat page snapshot, verify:
- Agent name "nex" is displayed
- Status indicator dot is present
- Relay toggle switch exists (role="switch")
- Terminal button exists (aria-label="Terminal")
- Cron button exists (aria-label="Cron")

**Step 2: Toggle relay on**

Use `mcp__chrome-devtools__click` on the relay toggle. Take snapshot. Expected: aria-checked changes from "false" to "true".

**Step 3: Toggle relay off**

Use `mcp__chrome-devtools__click` on the relay toggle again. Take snapshot. Expected: aria-checked back to "false".

**Step 4: Open terminal split pane**

Use `mcp__chrome-devtools__click` on the Terminal button. Take snapshot. Expected: terminal panel appears on the right with "Terminal" heading and close button.

**Step 5: Close terminal split pane**

Use `mcp__chrome-devtools__click` on the Terminal button again (or the close X). Take snapshot. Expected: terminal panel disappears.

**Step 6: Open cron split pane**

Use `mcp__chrome-devtools__click` on the Cron button. Take snapshot. Expected: cron panel appears showing "Cron Schedules" heading. If we created a cron in Task 1, it should be listed.

**Step 7: Close cron split pane and take screenshot**

Use `mcp__chrome-devtools__click` on Cron button. Verify pane closes.

---

### Task 5: Agent Chat View - Send Message & Slash Commands

**Step 1: Type a message in the composer**

Use `mcp__chrome-devtools__fill` on the message textarea (find by aria-label="Message nex...") with text "Hello from E2E test".

**Step 2: Send the message**

Use `mcp__chrome-devtools__press_key` with `Enter`.

**Step 3: Verify message appears in the list**

Wait briefly, then `mcp__chrome-devtools__take_snapshot`. Expected: message "Hello from E2E test" appears in the message list area.

**Step 4: Test slash command autocomplete - type /a**

Use `mcp__chrome-devtools__fill` on the textarea with "/a". Take snapshot. Expected: autocomplete popup appears showing "/abort" command.

**Step 5: Dismiss slash autocomplete**

Use `mcp__chrome-devtools__press_key` with `Escape`. Take snapshot. Expected: autocomplete popup disappears.

**Step 6: Test slash command /interrupt**

Use `mcp__chrome-devtools__fill` on the textarea with "/int". Take snapshot. Expected: autocomplete shows "/interrupt" option.

**Step 7: Accept slash command via Enter**

Use `mcp__chrome-devtools__press_key` with `Enter` to accept the command. Take snapshot. Expected: textarea now contains "/interrupt".

**Step 8: Clear the composer**

Use `mcp__chrome-devtools__fill` on the textarea with "" (empty). This resets for next tests.

---

### Task 6: Left Panel - Teams Tab & Team Navigation

**Step 1: Click on the Teams tab**

Use `mcp__chrome-devtools__click` on the "Teams" tab button.

**Step 2: Verify team list shows research**

Use `mcp__chrome-devtools__take_snapshot`. Expected: team "research" appears with member count "1 members".

**Step 3: Click on team research**

Use `mcp__chrome-devtools__click` on the research team entry.

**Step 4: Verify team chat view rendered**

Use `mcp__chrome-devtools__take_snapshot`. Expected:
- URL is now /teams/research
- Header shows "research" with team icon and member count
- Message composer is present
- Members panel toggle button exists

**Step 5: Toggle members panel**

Use `mcp__chrome-devtools__click` on the members panel toggle button (aria-label="Toggle members panel"). Take snapshot. Expected: side panel appears showing "Members" heading with "nex" listed.

**Step 6: Close members panel**

Use `mcp__chrome-devtools__click` on close button in members panel (aria-label="Close members panel").

**Step 7: Take screenshot of team chat view**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 7: Left Panel - Settings Tab & Admin Navigation

**Step 1: Click on Settings tab**

Use `mcp__chrome-devtools__click` on the "Settings" tab button.

**Step 2: Verify settings panel content**

Use `mcp__chrome-devtools__take_snapshot`. Expected:
- Connection status card showing "Connected" with green indicator
- Theme toggle button (Light/Dark Mode)
- "Daemon Status" link/button
- "Disconnect" button

**Step 3: Navigate to Admin/Daemon Status**

Use `mcp__chrome-devtools__click` on the "Daemon Status" button.

**Step 4: Verify admin page rendered**

Use `mcp__chrome-devtools__take_snapshot`. Expected:
- URL is /admin
- "Daemon Status" heading
- Connection banner (Connected to daemon)
- Stat cards: Agents count, Teams count, Cron Jobs count, Adapters count
- Detail cards: Data Directory, Timezone, Active Adapters, Agent Bindings

**Step 5: Verify stat card values**

From snapshot, check:
- Agents: 1 (1 running or 0 running)
- Teams: 1
- Cron Jobs: 1 (1 total)

**Step 6: Take screenshot of admin dashboard**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 8: Browser Back/Forward Navigation

**Step 1: Current URL should be /admin**

Verify from previous task.

**Step 2: Navigate back**

Use `mcp__chrome-devtools__navigate_page` with `type: "back"`.

**Step 3: Verify we're back at /teams/research**

Use `mcp__chrome-devtools__take_snapshot`. Expected: team chat view for "research" is shown.

**Step 4: Navigate back again**

Use `mcp__chrome-devtools__navigate_page` with `type: "back"`.

**Step 5: Verify we're at /agents/nex/default**

Use `mcp__chrome-devtools__take_snapshot`. Expected: agent chat view for "nex" is shown.

**Step 6: Navigate forward**

Use `mcp__chrome-devtools__navigate_page` with `type: "forward"`.

**Step 7: Verify we're at /teams/research again**

Use `mcp__chrome-devtools__take_snapshot`. Confirm team chat view is rendered.

---

### Task 9: Deep Link While Authenticated

**Step 1: Navigate directly to /agents/nex/default via URL**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/agents/nex/default`.

**Step 2: Verify chat view renders directly**

Use `mcp__chrome-devtools__take_snapshot`. Expected: agent chat view for nex/default renders with left panel, header, messages, composer. No login screen.

**Step 3: Navigate to /admin directly**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/admin`.

**Step 4: Verify admin page renders**

Use `mcp__chrome-devtools__take_snapshot`. Expected: daemon status dashboard.

**Step 5: Navigate to /teams/research directly**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/teams/research`.

**Step 6: Verify team chat renders**

Use `mcp__chrome-devtools__take_snapshot`. Expected: team chat view for research.

---

### Task 10: Agent Redirect (/agents/nex -> /agents/nex/default)

**Step 1: Navigate to /agents/nex (no chatId)**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/agents/nex`.

**Step 2: Verify redirect to /agents/nex/default**

Use `mcp__chrome-devtools__take_snapshot`. Expected: page shows agent chat view for nex/default (the server-side redirect should have happened).

---

### Task 11: Root Empty State

**Step 1: Navigate to /**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000`.

**Step 2: Verify empty state**

Use `mcp__chrome-devtools__take_snapshot`. Expected: main content area shows "Hi-Boss Control" and "Select a conversation to begin". Left panel is visible.

**Step 3: Take screenshot**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 12: Deep Link While Unauthenticated

**Step 1: Logout**

Navigate to root, click Settings tab, then click "Disconnect" button.

**Step 2: Verify login screen appears**

Use `mcp__chrome-devtools__take_snapshot`. Expected: login screen with token input.

**Step 3: Navigate to deep link /agents/nex/default**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/agents/nex/default`.

**Step 4: Verify login screen shown at that URL**

Use `mcp__chrome-devtools__take_snapshot`. Expected: login screen is shown (not the chat view). The URL bar should still be `/agents/nex/default`.

**Step 5: Login with token**

Fill the token input and submit.

**Step 6: Verify chat view renders without redirect**

Use `mcp__chrome-devtools__take_snapshot`. Expected: after login, the agent chat view for nex/default renders directly at the same URL. No redirect to `/`.

**Step 7: Take final screenshot**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 13: Demo Page Preserved

**Step 1: Navigate to /demo**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/demo`.

**Step 2: Verify demo page renders with mock data**

Use `mcp__chrome-devtools__take_snapshot`. Expected: demo page renders with mock agents, conversations, and team data. Should have left panel, chat view, all demo features.

**Step 3: Verify demo enhancements present**

From the snapshot, check for:
- Relay toggle in demo chat header
- Agent details button (info icon)
- Slash command support in composer
- Terminal and Cron buttons

**Step 4: Take screenshot of demo page**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 14: Tab Switch Preserves Main Content

**Step 1: Navigate to /agents/nex/default**

Use `mcp__chrome-devtools__navigate_page` with url `http://localhost:3000/agents/nex/default`.

**Step 2: Verify agent chat is shown in main area**

Use `mcp__chrome-devtools__take_snapshot`. Confirm chat view for nex.

**Step 3: Switch bottom tab from Chats to Agents**

Use `mcp__chrome-devtools__click` on "Agents" tab.

**Step 4: Verify main content unchanged**

Use `mcp__chrome-devtools__take_snapshot`. Expected: left panel now shows agent list (Agents tab), BUT the main content area still shows the nex/default chat view. The URL should still be `/agents/nex/default`.

**Step 5: Switch to Teams tab**

Use `mcp__chrome-devtools__click` on "Teams" tab.

**Step 6: Verify main content still unchanged**

Use `mcp__chrome-devtools__take_snapshot`. Expected: left panel shows teams, main content still shows nex/default chat.

**Step 7: Take screenshot showing tab switch with preserved content**

Use `mcp__chrome-devtools__take_screenshot`.

---

### Task 15: Theme Toggle

**Step 1: Click Settings tab**

Use `mcp__chrome-devtools__click` on "Settings" tab.

**Step 2: Click theme toggle**

Find the Light/Dark Mode button from snapshot and click it.

**Step 3: Take screenshot in toggled theme**

Use `mcp__chrome-devtools__take_screenshot`. Visual diff should show theme changed (dark<->light).

**Step 4: Toggle back**

Click the theme toggle again to restore original theme.

---

### Task 16: Cleanup & Summary

**Step 1: Remove test team (optional)**

```bash
TOKEN="aabbccdd11223344aabbccdd11223344"
curl -s -X DELETE http://localhost:3889/api/teams/research \
  -H "Authorization: Bearer $TOKEN"
```

**Step 2: Remove test cron (optional)**

Get the cron ID from Task 1 and delete it.

**Step 3: Write test summary**

Document all PASS/FAIL results from the 15 test tasks above.
