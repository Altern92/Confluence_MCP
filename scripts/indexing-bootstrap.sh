#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

usage() {
  cat <<'EOF'
Naudojimas:
  ./scripts/indexing-bootstrap.sh [--spaces=PA,DS] [--max-pages-per-space=100] [--max-spaces=5] [--reason=bootstrap]

Pastabos:
  - jei argumentu nera, bus paleistas `full` bootstrap per visa allowlist is `.env`
  - dabartinis `.env` allowlist jau riboja indexing iki ne asmeniniu space
  - skriptas neijungia background sync; jis paleidzia tik viena kontroliuojama bootstrap run
  - jei reikia `sudo docker`, paleisk su `USE_SUDO=1`
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
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

container_health() {
  local container="$1"
  docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}"
}

server_health="$(container_health confluence-mcp-server)"
postgres_health="$(container_health confluence-mcp-postgres)"

if [[ "${server_health}" != "healthy" ]]; then
  echo "confluence-mcp-server nera healthy: ${server_health}" >&2
  exit 1
fi

if [[ "${postgres_health}" != "healthy" ]]; then
  echo "confluence-mcp-postgres nera healthy: ${postgres_health}" >&2
  exit 1
fi

mkdir -p .tmp/indexing

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
log_file=".tmp/indexing/bootstrap-${timestamp}.json"

command=(node dist/indexing/run-indexing-job.js full --reason=bootstrap)

if [[ "$#" -gt 0 ]]; then
  command=(node dist/indexing/run-indexing-job.js full "$@")
fi

echo "== Bootstrap Start =="
echo "Server health: ${server_health}"
echo "Postgres health: ${postgres_health}"
echo "Log file: ${log_file}"
printf 'Command:'
for part in "${command[@]}"; do
  printf ' %q' "${part}"
done
printf '\n\n'

docker_cmd exec confluence-mcp-server "${command[@]}" | tee "${log_file}"

echo
echo "Bootstrap baigtas. Statusa gali tikrinti su:"
echo "  USE_SUDO=${USE_SUDO:-0} ./scripts/indexing-status.sh"
echo "Raw rezultatas issaugotas:"
echo "  ${log_file}"
