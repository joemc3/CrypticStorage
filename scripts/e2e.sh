#!/usr/bin/env bash
# End-to-end run without Docker: embedded Postgres + API with the local storage
# driver + the real client services driven from Node.
#
#   scripts/e2e.sh                    # uses an embedded Postgres
#   DATABASE_URL=... scripts/e2e.sh   # uses an existing Postgres
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${E2E_PORT:-4100}"
STORAGE_DIR="$(mktemp -d /tmp/cs-e2e-storage.XXXXXX)"
PG_OUT="$(mktemp)"
API_LOG="${E2E_API_LOG:-$(mktemp)}"
PG_PID=""
API_PID=""

# Each child runs in its own process group so the whole tree can be stopped.
cleanup() {
  for pid in "$API_PID" "$PG_PID"; do
    [[ -n "$pid" ]] && kill -TERM -- "-$pid" 2>/dev/null || true
  done
  sleep 1
  for pid in "$API_PID" "$PG_PID"; do
    [[ -n "$pid" ]] && kill -KILL -- "-$pid" 2>/dev/null || true
  done
  rm -rf "$STORAGE_DIR" "$PG_OUT"
}
trap cleanup EXIT

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "▶ starting embedded postgres"
  setsid bash -c "cd '$ROOT/server' && exec node scripts/embedded-db.mjs --port 54391 --db crypticstorage_e2e" >"$PG_OUT" 2>/dev/null &
  PG_PID=$!
  for _ in $(seq 1 90); do
    [[ -s "$PG_OUT" ]] && break
    sleep 1
  done
  DATABASE_URL="$(head -n1 "$PG_OUT")"
  [[ -n "$DATABASE_URL" ]] || { echo "embedded postgres failed to start"; exit 1; }
fi
export DATABASE_URL

echo "▶ applying migrations"
(cd "$ROOT/server" && npx prisma migrate deploy >/dev/null)

echo "▶ starting api on :$PORT (local storage driver), log: $API_LOG"
setsid env NODE_ENV=test PORT="$PORT" LOG_LEVEL=warn STORAGE_DRIVER=local STORAGE_LOCAL_PATH="$STORAGE_DIR" \
  JWT_SECRET="e2e-only-secret-e2e-only-secret-e2e-only-secret" APP_URL="http://localhost:3000" \
  API_PUBLIC_URL="http://127.0.0.1:$PORT/api" DATABASE_URL="$DATABASE_URL" \
  bash -c "cd '$ROOT/server' && exec npx tsx src/server.ts" >"$API_LOG" 2>&1 &
API_PID=$!

for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "api failed to start"; cat "$API_LOG"; exit 1; }

echo "▶ running client e2e against the live api"
(cd "$ROOT/client" && E2E_API_URL="http://127.0.0.1:$PORT/api" npx vitest run --config vitest.e2e.config.ts)
