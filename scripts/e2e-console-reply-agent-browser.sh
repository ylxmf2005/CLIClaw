#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:3000}"
API_URL="${API_URL:-http://localhost:3889}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
AGENT_NAME="${AGENT_NAME:-nex}"
SESSION_NAME="${SESSION_NAME:-hiboss-e2e-console-reply}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-120}"

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

extract_chat_id() {
  local response="$1"
  node -e '
const payload = JSON.parse(process.argv[1]);
const chatId = payload?.chatId ?? payload?.session?.bindings?.[0]?.chatId;
if (!chatId) process.exit(1);
process.stdout.write(chatId);
' "$response"
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

echo "Creating console session for agent '${AGENT_NAME}'..."
create_response="$(
  curl -fsS -X POST "${API_URL}/api/agents/${AGENT_NAME}/sessions" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"adapterType":"console"}'
)"
chat_id="$(extract_chat_id "$create_response")"
echo "Session chat id: ${chat_id}"

chat_url="${WEB_URL}/agents/${AGENT_NAME}/${chat_id}"
echo "Opening ${chat_url}"
agent-browser --session "$SESSION_NAME" open "$chat_url" >/dev/null

snap="$(snapshot_json)"
if printf '%s' "$snap" | grep -q '"Admin Token"'; then
  token_ref="$(find_ref "$snap" "Admin Token" "textbox")"
  connect_ref="$(find_ref "$snap" "Connect to Daemon" "button")"
  agent-browser --session "$SESSION_NAME" fill "$token_ref" "$ADMIN_TOKEN" >/dev/null
  agent-browser --session "$SESSION_NAME" click "$connect_ref" >/dev/null
  agent-browser --session "$SESSION_NAME" wait 2000 >/dev/null
  snap="$(snapshot_json)"
fi

composer_name="Message ${AGENT_NAME}..."
composer_ref="$(find_ref "$snap" "$composer_name" "textbox")"
message="e2e-console-reply-$(date +%s)"
echo "Sending: ${message}"
agent-browser --session "$SESSION_NAME" fill "$composer_ref" "$message" >/dev/null

send_snap="$(snapshot_json)"
send_ref="$(find_ref "$send_snap" "Send message" "button")"
agent-browser --session "$SESSION_NAME" click "$send_ref" >/dev/null

ui_snap="$(agent-browser --session "$SESSION_NAME" snapshot --json)"
if ! printf '%s' "$ui_snap" | grep -q "$message"; then
  echo "Sent message not visible in UI snapshot" >&2
  exit 1
fi

echo "Waiting for agent reply..."
deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
while true; do
  list_response="$(
    curl -fsS "${API_URL}/api/envelopes?to=channel:console:${chat_id}&status=done&limit=50" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}"
  )"
  if has_agent_reply "$list_response"; then
    echo "PASS: agent reply delivered to channel:console:${chat_id}"
    break
  fi

  if [[ $(date +%s) -ge $deadline ]]; then
    echo "Timed out waiting for agent reply on channel:console:${chat_id}" >&2
    exit 1
  fi

  sleep 2
done
