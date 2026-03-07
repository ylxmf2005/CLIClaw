#!/usr/bin/env bash
# E2E test: team mention fan-out via API
#
# Tests:
#   8.1 - Send @all, verify all members receive envelopes
#   8.2 - Send @nex only, verify only nex receives, others do not
#
# Requirements: running daemon on API_URL, ADMIN_TOKEN set

set -euo pipefail

API_URL="${API_URL:-http://localhost:3889}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
TEAM_NAME="${TEAM_NAME:-e2e-mentions-api}"
AGENT1="${AGENT1:-nex}"
AGENT2="${AGENT2:-echo-e2e}"
CLICLAW_DATA_DIR="${CLICLAW_DATA_DIR:-/Users/EthanLee/cliclaw-test}"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required" >&2
  exit 1
fi

api() {
  local method="$1" path="$2"
  shift 2
  curl -fsS -X "$method" "${API_URL}${path}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

envelope_count_for() {
  local agent="$1" marker="$2" created_after="$3"
  local response
  response="$(curl -fsS --get "${API_URL}/api/envelopes" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    --data-urlencode "to=agent:${agent}" \
    --data-urlencode "chatId=team:${TEAM_NAME}" \
    --data-urlencode "limit=50" \
    --data-urlencode "createdAfter=${created_after}")"
  node -e '
const payload = JSON.parse(process.argv[1]);
const marker = process.argv[2];
const count = (payload?.envelopes ?? []).filter((e) => {
  const text = e?.content?.text;
  return typeof text === "string" && text.includes(marker);
}).length;
process.stdout.write(String(count));
' "$response" "$marker"
}

echo "=== Setup ==="

echo "Ensuring agents exist..."
for agent in "$AGENT1" "$AGENT2"; do
  mkdir -p "${CLICLAW_DATA_DIR}/agents/${agent}/workspace"
  api POST "/api/agents" \
    -d "{\"name\":\"${agent}\",\"description\":\"Mention e2e agent\",\"workspace\":\"${CLICLAW_DATA_DIR}/agents/${agent}/workspace\",\"provider\":\"claude\"}" \
    >/dev/null 2>/dev/null || true
done

echo "Ensuring team '${TEAM_NAME}' exists with members..."
api POST "/api/teams" \
  -d "{\"name\":\"${TEAM_NAME}\",\"description\":\"Mention API e2e\"}" \
  >/dev/null 2>/dev/null || true

for agent in "$AGENT1" "$AGENT2"; do
  api POST "/api/teams/${TEAM_NAME}/members" \
    -d "{\"agentName\":\"${agent}\"}" \
    >/dev/null 2>/dev/null || true
done

members_response="$(api GET "/api/teams/${TEAM_NAME}/members")"
node -e '
const payload = JSON.parse(process.argv[1]);
const required = process.argv.slice(2);
const members = new Set((payload?.members ?? []).map((m) => String(m?.agentName ?? "")));
const ok = required.every((name) => members.has(name));
if (!ok) { console.error("Missing required members"); process.exit(1); }
' "$members_response" "$AGENT1" "$AGENT2" || {
  echo "Team members not ready" >&2
  exit 1
}

console_from="channel:console:team-chat-${TEAM_NAME}"
created_after="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

echo ""
echo "=== Test 8.1: @all fan-out ==="

marker_all="e2e-all-$(date +%s)"
echo "Sending @all message with marker: ${marker_all}"

result_all="$(api POST "/api/envelopes" \
  -d "{\"to\":\"team:${TEAM_NAME}\",\"from\":\"${console_from}\",\"text\":\"${marker_all}\",\"mentions\":[\"@all\"]}")"

ids_count="$(node -e '
const r = JSON.parse(process.argv[1]);
const ids = r?.ids ?? [];
process.stdout.write(String(ids.length));
' "$result_all")"

if [[ "$ids_count" -lt 2 ]]; then
  echo "FAIL: Expected at least 2 envelope IDs from @all, got ${ids_count}" >&2
  echo "Response: ${result_all}" >&2
  exit 1
fi
echo "Created ${ids_count} envelopes"

# Allow brief propagation
sleep 1

count1="$(envelope_count_for "$AGENT1" "$marker_all" "$created_after")"
count2="$(envelope_count_for "$AGENT2" "$marker_all" "$created_after")"

if [[ "$count1" -lt 1 ]]; then
  echo "FAIL: ${AGENT1} did not receive @all message" >&2
  exit 1
fi
if [[ "$count2" -lt 1 ]]; then
  echo "FAIL: ${AGENT2} did not receive @all message" >&2
  exit 1
fi

echo "PASS: @all fan-out delivered to ${AGENT1} (${count1}) and ${AGENT2} (${count2})"

echo ""
echo "=== Test 8.2: Single mention routing ==="

created_after_single="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
marker_single="e2e-single-$(date +%s)"
echo "Sending @${AGENT1} only message with marker: ${marker_single}"

result_single="$(api POST "/api/envelopes" \
  -d "{\"to\":\"team:${TEAM_NAME}\",\"from\":\"${console_from}\",\"text\":\"${marker_single}\",\"mentions\":[\"${AGENT1}\"]}")"

single_ids_count="$(node -e '
const r = JSON.parse(process.argv[1]);
const ids = r?.ids ?? [];
process.stdout.write(String(ids.length));
' "$result_single")"

if [[ "$single_ids_count" -ne 1 ]]; then
  echo "FAIL: Expected exactly 1 envelope ID for single mention, got ${single_ids_count}" >&2
  echo "Response: ${result_single}" >&2
  exit 1
fi
echo "Created ${single_ids_count} envelope"

sleep 1

count1_single="$(envelope_count_for "$AGENT1" "$marker_single" "$created_after_single")"
count2_single="$(envelope_count_for "$AGENT2" "$marker_single" "$created_after_single")"

if [[ "$count1_single" -lt 1 ]]; then
  echo "FAIL: ${AGENT1} did not receive single-mention message" >&2
  exit 1
fi
if [[ "$count2_single" -ne 0 ]]; then
  echo "FAIL: ${AGENT2} should NOT have received single-mention message (got ${count2_single})" >&2
  exit 1
fi

echo "PASS: Single mention routed to ${AGENT1} only (${AGENT1}=${count1_single}, ${AGENT2}=${count2_single})"

echo ""
echo "=== Test: Missing mentions rejected ==="

http_code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${API_URL}/api/envelopes" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"team:${TEAM_NAME}\",\"from\":\"${console_from}\",\"text\":\"no mentions\"}")"

if [[ "$http_code" != "400" ]]; then
  echo "FAIL: Expected 400 for missing mentions, got ${http_code}" >&2
  exit 1
fi

echo "PASS: Missing mentions correctly rejected (HTTP ${http_code})"

echo ""
echo "=== All API mention tests passed ==="
