#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:3000}"
API_URL="${API_URL:-http://localhost:3889}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
TEAM_NAME="${TEAM_NAME:-teamchat-e2e}"
AGENT_NAME="${AGENT_NAME:-nex}"
SECONDARY_AGENT_NAME="${SECONDARY_AGENT_NAME:-echo-e2e}"
CLICLAW_DATA_DIR="${CLICLAW_DATA_DIR:-/Users/EthanLee/cliclaw-test}"
SESSION_NAME="${SESSION_NAME:-cliclaw-e2e-team-chat-reply}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-150}"

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

has_agent_reply() {
  local response="$1"
  local expected_from="agent:${AGENT_NAME}"
  node -e '
const payload = JSON.parse(process.argv[1]);
const expectedFrom = process.argv[2];
const list = payload?.envelopes ?? [];
const ok = list.some((item) => item?.from === expectedFrom);
process.exit(ok ? 0 : 1);
' "$response" "$expected_from"
}

contains_marker_text() {
  local response="$1"
  local marker="$2"
  node -e '
const payload = JSON.parse(process.argv[1]);
const marker = process.argv[2];
const list = payload?.envelopes ?? [];
const found = list.some((item) => {
  const text = item?.content?.text;
  return typeof text === "string" && text.includes(marker);
});
process.exit(found ? 0 : 1);
' "$response" "$marker"
}

echo "Ensuring team '${TEAM_NAME}' exists..."
curl -fsS -X POST "${API_URL}/api/teams" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${TEAM_NAME}\",\"description\":\"Team chat e2e\"}" >/dev/null 2>/dev/null || true

echo "Ensuring member '${AGENT_NAME}' is in team '${TEAM_NAME}'..."
curl -fsS -X POST "${API_URL}/api/teams/${TEAM_NAME}/members" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"agentName\":\"${AGENT_NAME}\"}" >/dev/null 2>/dev/null || true

echo "Ensuring secondary agent '${SECONDARY_AGENT_NAME}' exists..."
mkdir -p "${CLICLAW_DATA_DIR}/agents/${SECONDARY_AGENT_NAME}/workspace"
curl -fsS -X POST "${API_URL}/api/agents" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${SECONDARY_AGENT_NAME}\",\"description\":\"Team mention e2e secondary agent\",\"workspace\":\"${CLICLAW_DATA_DIR}/agents/${SECONDARY_AGENT_NAME}/workspace\",\"provider\":\"claude\"}" >/dev/null 2>/dev/null || true

echo "Ensuring member '${SECONDARY_AGENT_NAME}' is in team '${TEAM_NAME}'..."
curl -fsS -X POST "${API_URL}/api/teams/${TEAM_NAME}/members" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"agentName\":\"${SECONDARY_AGENT_NAME}\"}" >/dev/null 2>/dev/null || true

members_response="$(curl -fsS "${API_URL}/api/teams/${TEAM_NAME}/members" -H "Authorization: Bearer ${ADMIN_TOKEN}")"
node -e '
const payload = JSON.parse(process.argv[1]);
const required = [process.argv[2], process.argv[3]];
const members = new Set((payload?.members ?? []).map((m) => String(m?.agentName ?? "")));
const ok = required.every((name) => members.has(name));
if (!ok) process.exit(1);
' "$members_response" "$AGENT_NAME" "$SECONDARY_AGENT_NAME" || {
  echo "Team members are not ready for mention routing test" >&2
  exit 1
}

team_url="${WEB_URL}/teams/${TEAM_NAME}"
echo "Opening ${team_url}"
agent-browser --session "$SESSION_NAME" open "$team_url" >/dev/null

snap="$(snapshot_json)"
if printf '%s' "$snap" | grep -q '"Admin Token"'; then
  token_ref="$(find_ref "$snap" "Admin Token" "textbox")"
  connect_ref="$(find_ref "$snap" "Connect to Daemon" "button")"
  agent-browser --session "$SESSION_NAME" fill "$token_ref" "$ADMIN_TOKEN" >/dev/null
  agent-browser --session "$SESSION_NAME" click "$connect_ref" >/dev/null
  agent-browser --session "$SESSION_NAME" wait 2000 >/dev/null
  snap="$(snapshot_json)"
fi

if printf '%s' "$snap" | grep -q 'tab "Chats"'; then
  echo "Unexpected Chats tab found in navigation" >&2
  exit 1
fi

composer_ref="$(find_ref "$snap" "Message ${TEAM_NAME}..." "textbox")"
created_after="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
marker="e2e-team-mention-$(date +%s)"
message="@${AGENT_NAME} ${marker}"
echo "Sending: ${message} (secondary member: ${SECONDARY_AGENT_NAME})"
agent-browser --session "$SESSION_NAME" fill "$composer_ref" "$message" >/dev/null

send_snap="$(snapshot_json)"
send_ref="$(find_ref "$send_snap" "Send message" "button")"
agent-browser --session "$SESSION_NAME" click "$send_ref" >/dev/null

ui_snap="$(agent-browser --session "$SESSION_NAME" snapshot --json)"
if ! printf '%s' "$ui_snap" | grep -q "$marker"; then
  echo "Sent team message not visible in UI snapshot" >&2
  exit 1
fi

console_chat_to="channel:console:team-chat-${TEAM_NAME}"
echo "Waiting for agent reply on ${console_chat_to}..."
deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
while true; do
  list_response="$(
    curl -fsS "${API_URL}/api/envelopes?to=${console_chat_to}&status=done&limit=50" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}"
  )"
  if has_agent_reply "$list_response"; then
    echo "PASS: team chat reply delivered on ${console_chat_to}"
    ui_deadline=$(( $(date +%s) + 30 ))
    while true; do
      final_snap="$(agent-browser --session "$SESSION_NAME" snapshot --json)"
      if printf '%s' "$final_snap" | grep -q "$AGENT_NAME"; then
        break
      fi
      if [[ $(date +%s) -ge $ui_deadline ]]; then
        echo "Agent reply not visible in team chat UI snapshot" >&2
        exit 1
      fi
      sleep 2
    done

    secondary_done="$(
      curl -fsS --get "${API_URL}/api/envelopes" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        --data-urlencode "to=agent:${SECONDARY_AGENT_NAME}" \
        --data-urlencode "chatId=team:${TEAM_NAME}" \
        --data-urlencode "status=done" \
        --data-urlencode "limit=50" \
        --data-urlencode "createdAfter=${created_after}"
    )"
    secondary_pending="$(
      curl -fsS --get "${API_URL}/api/envelopes" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        --data-urlencode "to=agent:${SECONDARY_AGENT_NAME}" \
        --data-urlencode "chatId=team:${TEAM_NAME}" \
        --data-urlencode "status=pending" \
        --data-urlencode "limit=50" \
        --data-urlencode "createdAfter=${created_after}"
    )"
    if contains_marker_text "$secondary_done" "$marker" || contains_marker_text "$secondary_pending" "$marker"; then
      echo "Mention routing failed: marker message reached secondary member ${SECONDARY_AGENT_NAME}" >&2
      exit 1
    fi

    break
  fi

  if [[ $(date +%s) -ge $deadline ]]; then
    echo "Timed out waiting for team chat reply on ${console_chat_to}" >&2
    exit 1
  fi

  sleep 2
done
