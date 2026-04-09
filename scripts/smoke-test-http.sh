#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PORT="${SMOKE_PORT:-3301}"
HOST="${SMOKE_HOST:-127.0.0.1}"
SPACE_KEY="${SMOKE_SPACE_KEY:-}"
QUERY="${SMOKE_QUERY:-platform}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required in PATH" >&2
  exit 1
fi

if [[ ! -f dist/index.js ]]; then
  echo "dist/index.js is missing. Run npm run build first." >&2
  exit 1
fi

API_KEY="$(grep '^MCP_API_KEY=' .env | cut -d= -f2-)"
CONFLUENCE_EMAIL="$(grep '^CONFLUENCE_EMAIL=' .env | cut -d= -f2-)"
CONFLUENCE_API_TOKEN="$(grep '^CONFLUENCE_API_TOKEN=' .env | cut -d= -f2-)"

LOG_FILE="/tmp/confluence-mcp-smoke-${PORT}.log"

HOST="${HOST}" \
PORT="${PORT}" \
MCP_ALLOWED_HOSTS="${HOST},localhost" \
INDEXING_SEMANTIC_ENABLED=false \
INDEXING_VECTOR_STORE_DRIVER=memory \
node dist/index.js >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS "http://${HOST}:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "== /health =="
curl -fsS "http://${HOST}:${PORT}/health"
echo
echo "== /ready =="
curl -fsS "http://${HOST}:${PORT}/ready"
echo

echo "== tools/list =="
TOOLS_RESPONSE="$(curl -fsS "http://${HOST}:${PORT}/mcp" \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -H "x-api-key: ${API_KEY}" \
  --data '{"jsonrpc":"2.0","id":"tools-1","method":"tools/list","params":{}}')"
printf '%s\n' "${TOOLS_RESPONSE}" | sed -n '1,5p'

if [[ -n "${SPACE_KEY}" ]]; then
  echo
  echo "== confluence.search (${SPACE_KEY}) =="
  SEARCH_RESPONSE="$(curl -fsS "http://${HOST}:${PORT}/mcp" \
    -H 'accept: application/json, text/event-stream' \
    -H 'content-type: application/json' \
    -H "x-api-key: ${API_KEY}" \
    -H "x-confluence-email: ${CONFLUENCE_EMAIL}" \
    -H "x-confluence-api-token: ${CONFLUENCE_API_TOKEN}" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":\"search-1\",\"method\":\"tools/call\",\"params\":{\"name\":\"confluence.search\",\"arguments\":{\"query\":\"${QUERY}\",\"scope\":{\"type\":\"space\",\"spaceKey\":\"${SPACE_KEY}\"},\"retrieval\":{\"mode\":\"keyword\",\"topK\":3}}}}")"
  printf '%s\n' "${SEARCH_RESPONSE}" | sed -n '1,12p'
fi

echo
echo "Smoke test finished. Server log: ${LOG_FILE}"
