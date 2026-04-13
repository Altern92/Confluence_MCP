#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

usage() {
  cat <<'EOF'
Naudojimas:
  ./scripts/indexing-weekly-sync.sh [--dry-run]

Pastabos:
  - paleidzia pilna savaitini reindex pagal dabartini `.env` scope ir limitus
  - jei jau vyksta kitas indexing job, naujas paleidimas neprasides
  - `--dry-run` tik patikrina salygas ir nieko nepaleidzia
EOF
}

dry_run=0

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
fi

mkdir -p .tmp/indexing

LOCK_FILE="${LOCK_FILE:-${ROOT_DIR}/.tmp/indexing/weekly-sync.lock}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${ROOT_DIR}/.tmp/indexing/weekly-sync-${TIMESTAMP}.log"

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

container_health() {
  local container="$1"
  docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}"
}

indexing_job_running() {
  docker_cmd exec confluence-mcp-server sh -lc \
    "ps -eo args | awk '/node dist\\/indexing\\/run-indexing-job\\.js/ && \$0 !~ / status$/ {found=1} END {exit found ? 0 : 1}'"
}

exec 9>"${LOCK_FILE}"

if ! flock -n 9; then
  echo "Weekly sync jau vyksta. Lock file: ${LOCK_FILE}"
  exit 0
fi

{
  echo "== Weekly Sync Start =="
  echo "Timestamp: ${TIMESTAMP}"
  echo "Root: ${ROOT_DIR}"
  echo "Lock file: ${LOCK_FILE}"

  server_health="$(container_health confluence-mcp-server)"
  postgres_health="$(container_health confluence-mcp-postgres)"

  echo "Server health: ${server_health}"
  echo "Postgres health: ${postgres_health}"

  if [[ "${server_health}" != "healthy" ]]; then
    echo "confluence-mcp-server nera healthy: ${server_health}" >&2
    exit 1
  fi

  if [[ "${postgres_health}" != "healthy" ]]; then
    echo "confluence-mcp-postgres nera healthy: ${postgres_health}" >&2
    exit 1
  fi

  if indexing_job_running; then
    echo "Kitas indexing job jau vyksta. Naujas weekly sync nepaleidziamas."
    exit 0
  fi

  if [[ "${dry_run}" == "1" ]]; then
    echo "Dry-run: salygos tenkinamos, pilnas weekly sync galetu startuoti."
    exit 0
  fi

  echo
  echo "Paleidziamas pilnas savaitinis reindex pagal dabartini .env scope ir limitus."
  echo

  ./scripts/indexing-bootstrap.sh --reason=content_changed

  echo
  echo "== Weekly Sync Finished =="
  date -u +"Finished at: %Y-%m-%dT%H:%M:%SZ"
} | tee "${LOG_FILE}"
