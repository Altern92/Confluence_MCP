#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

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

raw="${1:-}"
status_json="$(docker_cmd exec confluence-mcp-server node dist/indexing/run-indexing-job.js status)"

if [[ "${raw}" == "--raw" ]]; then
  printf '%s\n' "${status_json}"
  exit 0
fi

STATUS_JSON="${status_json}" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["STATUS_JSON"])
snapshot = payload["snapshot"]
worker = snapshot["worker"]
index = snapshot["index"]
recent_runs = snapshot.get("recentRuns", [])

print("== Indexing Status ==")
print(f"worker.enabled: {worker['enabled']}")
print(f"configured spaces: {len(worker.get('configuredSpaceKeys', []))}")
print(f"documentCount: {index['documentCount']}")
print(f"chunkCount: {index['chunkCount']}")
print(f"vectorRecordCount: {index['vectorRecordCount']}")
print(f"watermarks: {len(snapshot.get('watermarks', []))}")
print(f"recentRuns: {len(recent_runs)}")

if index.get("spaces"):
    print("spaces:")
    for item in index["spaces"][:20]:
        print(f"  - {item['spaceKey']}: documents={item['documentCount']}, chunks={item['chunkCount']}")

if recent_runs:
    print("latest run:")
    latest = recent_runs[0]
    print(json.dumps({
        "runId": latest.get("runId"),
        "target": latest.get("target"),
        "reason": latest.get("reason"),
        "status": latest.get("status"),
        "stats": latest.get("stats"),
        "startedAt": latest.get("startedAt"),
        "finishedAt": latest.get("finishedAt"),
        "errorMessage": latest.get("errorMessage"),
    }, ensure_ascii=False, indent=2))
PY
