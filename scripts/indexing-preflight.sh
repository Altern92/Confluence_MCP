#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo ".env failas nerastas ${ROOT_DIR}" >&2
  exit 1
fi

docker_cmd() {
  if [[ "${USE_SUDO:-0}" == "1" ]]; then
    if [[ -n "${SUDO_PASSWORD:-}" ]]; then
      printf '%s\n' "${SUDO_PASSWORD}" | sudo -S -p '' docker "$@"
      return
    fi

    sudo docker "$@"
    return
  fi

  docker "$@"
}

env_value() {
  local key="$1"
  grep -E "^${key}=" .env | head -n1 | cut -d= -f2-
}

container_health() {
  local container="$1"
  docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}"
}

allowed_spaces_csv="$(env_value CONFLUENCE_ALLOWED_SPACE_KEYS)"
sync_spaces_csv="$(env_value INDEXING_SYNC_SPACE_KEYS)"
sync_enabled="$(env_value INDEXING_SYNC_ENABLED)"
max_pages_per_space="$(env_value INDEXING_SYNC_MAX_PAGES_PER_SPACE)"
vector_driver="$(env_value INDEXING_VECTOR_STORE_DRIVER)"

allowed_spaces_count="$(python3 - <<'PY' "${allowed_spaces_csv}"
import sys
value = sys.argv[1] if len(sys.argv) > 1 else ""
items = [item.strip() for item in value.split(",") if item.strip()]
print(len(items))
PY
)"

sync_spaces_count="$(python3 - <<'PY' "${sync_spaces_csv}"
import sys
value = sys.argv[1] if len(sys.argv) > 1 else ""
items = [item.strip() for item in value.split(",") if item.strip()]
print(len(items))
PY
)"

server_health="$(container_health confluence-mcp-server)"
postgres_health="$(container_health confluence-mcp-postgres)"
disk_summary="$(df -h "${ROOT_DIR}" | tail -n1)"
extensions="$(docker_cmd exec confluence-mcp-postgres psql -U confluence_mcp -d confluence_mcp -At -c "SELECT extname FROM pg_extension ORDER BY extname;")"
status_json="$(docker_cmd exec confluence-mcp-server node dist/indexing/run-indexing-job.js status)"

echo "== Indexing Preflight =="
echo "Root: ${ROOT_DIR}"
echo "Server health: ${server_health}"
echo "Postgres health: ${postgres_health}"
echo "Disk: ${disk_summary}"
echo "Allowed spaces: ${allowed_spaces_count}"
echo "Sync spaces: ${sync_spaces_count}"
echo "Sync enabled: ${sync_enabled}"
echo "Max pages per space: ${max_pages_per_space}"
echo "Vector store driver: ${vector_driver}"
echo "Postgres extensions:"
printf '%s\n' "${extensions}" | sed 's/^/  - /'

echo
echo "== Current Index Status =="
STATUS_JSON="${status_json}" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["STATUS_JSON"])
snapshot = payload["snapshot"]
index = snapshot["index"]
worker = snapshot["worker"]
recent_runs = snapshot.get("recentRuns", [])

print(f"worker.enabled={worker['enabled']}")
print(f"worker.configuredSpaceKeys={len(worker.get('configuredSpaceKeys', []))}")
print(f"index.documentCount={index['documentCount']}")
print(f"index.chunkCount={index['chunkCount']}")
print(f"index.vectorRecordCount={index['vectorRecordCount']}")
print(f"recentRuns={len(recent_runs)}")

if recent_runs:
    latest = recent_runs[0]
    print("latestRun=" + json.dumps({
        "runId": latest.get("runId"),
        "target": latest.get("target"),
        "status": latest.get("status"),
        "stats": latest.get("stats"),
        "finishedAt": latest.get("finishedAt"),
    }, ensure_ascii=False))
PY
