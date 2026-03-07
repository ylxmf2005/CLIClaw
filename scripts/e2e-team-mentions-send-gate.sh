#!/usr/bin/env bash
# E2E test: verify send button is disabled without mentions, enabled with mentions
#
# Test 8.3 - UI send gate for team chat
#
# Requirements: running daemon + web frontend, agent-browser installed, ADMIN_TOKEN set

set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:3000}"
API_URL="${API_URL:-http://localhost:3889}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
TEAM_NAME="${TEAM_NAME:-e2e-send-gate}"
AGENT_NAME="${AGENT_NAME:-nex}"
CLICLAW_DATA_DIR="${CLICLAW_DATA_DIR:-/Users/EthanLee/cliclaw-test}"
SESSION_NAME="${SESSION_NAME:-cliclaw-e2e-send-gate}"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required" >&2
  exit 1
fi

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser is required" >&2
  exit 1
fi

snapshot_json() {
  agent-browser --session "$SESSION_NAME" snapshot -i --json
}

find_ref() {
  local snapshot="$1"
  local target_name="$2"
  local target_role="$3"
  node -e '
const payload = JSON.parse(process.argv[1]);
const targetName = process.argv[2];
const targetRole = process.argv[3];
const refs = payload?.data?.refs ?? {};
for (const [id, meta] of Object.entries(refs)) {
  if (meta?.name !== targetName) continue;
  if (targetRole && meta?.role !== targetRole) continue;
  process.stdout.write(`@${id}`);
  process.exit(0);
}
process.exit(1);
' "$snapshot" "$target_name" "$target_role"
}

is_button_disabled() {
  local snapshot="$1"
  local button_name="$2"
  node -e '
const payload = JSON.parse(process.argv[1]);
const buttonName = process.argv[2];
const refs = payload?.data?.refs ?? {};
for (const [id, meta] of Object.entries(refs)) {
  if (meta?.name !== buttonName) continue;
  if (meta?.role !== "button") continue;
  // Check disabled attribute in the accessibility tree
  const disabled = meta?.disabled === true || meta?.disabled === "true";
  process.stdout.write(disabled ? "true" : "false");
  process.exit(0);
}
// Button not found = effectively disabled
process.stdout.write("not_found");
process.exit(0);
' "$snapshot" "$button_name"
}

echo "=== Setup ==="

echo "Ensuring agent '${AGENT_NAME}' and team '${TEAM_NAME}' exist..."
mkdir -p "${CLICLAW_DATA_DIR}/agents/${AGENT_NAME}/workspace"
curl -fsS -X POST "${API_URL}/api/agents" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${AGENT_NAME}\",\"description\":\"Send gate e2e\",\"workspace\":\"${CLICLAW_DATA_DIR}/agents/${AGENT_NAME}/workspace\",\"provider\":\"claude\"}" \
  >/dev/null 2>/dev/null || true

curl -fsS -X POST "${API_URL}/api/teams" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${TEAM_NAME}\",\"description\":\"Send gate test\"}" \
  >/dev/null 2>/dev/null || true

curl -fsS -X POST "${API_URL}/api/teams/${TEAM_NAME}/members" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"agentName\":\"${AGENT_NAME}\"}" \
  >/dev/null 2>/dev/null || true

echo ""
echo "=== Test 8.3: Send button gate ==="

team_url="${WEB_URL}/teams/${TEAM_NAME}"
echo "Opening ${team_url}"
agent-browser --session "$SESSION_NAME" open "$team_url" >/dev/null

snap="$(snapshot_json)"

# Handle auth if needed
if printf '%s' "$snap" | grep -q '"Admin Token"'; then
  token_ref="$(find_ref "$snap" "Admin Token" "textbox")"
  connect_ref="$(find_ref "$snap" "Connect to Daemon" "button")"
  agent-browser --session "$SESSION_NAME" fill "$token_ref" "$ADMIN_TOKEN" >/dev/null
  agent-browser --session "$SESSION_NAME" click "$connect_ref" >/dev/null
  agent-browser --session "$SESSION_NAME" wait 2000 >/dev/null
  snap="$(snapshot_json)"
fi

# Step 1: Check send button is disabled when no mentions
send_state="$(is_button_disabled "$snap" "Send message")"
echo "Send button state (no mentions): ${send_state}"

if [[ "$send_state" == "false" ]]; then
  echo "FAIL: Send button should be disabled when no mentions are selected" >&2
  exit 1
fi
echo "PASS: Send button is disabled/hidden with no mentions"

# Step 2: Click the @ button to open autocomplete
at_ref="$(find_ref "$snap" "Add mention" "button" 2>/dev/null || find_ref "$snap" "@" "button" 2>/dev/null)" || {
  # Try finding any button with @ in the name
  at_ref="$(node -e '
const payload = JSON.parse(process.argv[1]);
const refs = payload?.data?.refs ?? {};
for (const [id, meta] of Object.entries(refs)) {
  if (meta?.role !== "button") continue;
  const name = String(meta?.name ?? "");
  if (name.includes("@") || name.includes("mention") || name.includes("Mention")) {
    process.stdout.write(`@${id}`);
    process.exit(0);
  }
}
process.exit(1);
' "$snap")"
}

echo "Clicking @ button to open autocomplete..."
agent-browser --session "$SESSION_NAME" click "$at_ref" >/dev/null
agent-browser --session "$SESSION_NAME" wait 500 >/dev/null

# Step 3: Take snapshot with autocomplete open, find a member option
ac_snap="$(snapshot_json)"

# Find the @all option or the agent name in the autocomplete
member_ref="$(node -e '
const payload = JSON.parse(process.argv[1]);
const agentName = process.argv[2];
const refs = payload?.data?.refs ?? {};
// Look for an option matching @all or the agent name
for (const [id, meta] of Object.entries(refs)) {
  const name = String(meta?.name ?? "");
  if (name.includes("@all") || name === "@all") {
    process.stdout.write(`@${id}`);
    process.exit(0);
  }
}
for (const [id, meta] of Object.entries(refs)) {
  const name = String(meta?.name ?? "");
  if (name.includes(agentName)) {
    process.stdout.write(`@${id}`);
    process.exit(0);
  }
}
process.exit(1);
' "$ac_snap" "$AGENT_NAME")" || {
  echo "FAIL: Could not find autocomplete option for @all or ${AGENT_NAME}" >&2
  echo "Available refs:" >&2
  node -e '
const payload = JSON.parse(process.argv[1]);
const refs = payload?.data?.refs ?? {};
for (const [id, meta] of Object.entries(refs)) {
  console.error(`  ${id}: ${JSON.stringify(meta)}`);
}
' "$ac_snap" >&2
  exit 1
}

echo "Selecting mention from autocomplete..."
agent-browser --session "$SESSION_NAME" click "$member_ref" >/dev/null
agent-browser --session "$SESSION_NAME" wait 500 >/dev/null

# Step 4: Check send button is now enabled
final_snap="$(snapshot_json)"
send_state_after="$(is_button_disabled "$final_snap" "Send message")"
echo "Send button state (with mention): ${send_state_after}"

if [[ "$send_state_after" != "false" ]]; then
  echo "FAIL: Send button should be enabled after adding a mention (state: ${send_state_after})" >&2
  exit 1
fi

echo "PASS: Send button is enabled after adding a mention"

echo ""
echo "=== All send gate tests passed ==="
