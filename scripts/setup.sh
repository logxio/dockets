#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found. Install Docker Desktop first." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose not found. Install Docker Desktop (Compose v2) or docker-compose." >&2
  exit 1
fi

"${COMPOSE[@]}" -f "$ROOT_DIR/docker-compose.yml" build

cat <<EOF

Build complete.
- Start: ${COMPOSE[*]} -f "$ROOT_DIR/docker-compose.yml" up
- Stop:  ${COMPOSE[*]} -f "$ROOT_DIR/docker-compose.yml" down
EOF
