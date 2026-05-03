#!/usr/bin/env bash
# Bring up the full Squadron dev environment on the Mac mini:
#   1. daemon (port 7878)
#   2. static server for Squadron.html + raw JSX (port 8787)
#   3. two cloudflared quick tunnels (one per service)
# Prints the constructed browser URL at the end.
#
#   bash scripts/bringup.sh                    # full stack
#   SKIP_TUNNELS=1 bash scripts/bringup.sh     # local only (point browser at http://localhost:8787)
#   bash scripts/bringup.sh --kill             # stop everything
#
# Logs land in /tmp/squadron-{daemon,static,cf-daemon,cf-static}.log.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DAEMON_LOG=/tmp/squadron-daemon.log
STATIC_LOG=/tmp/squadron-static.log
CF_DAEMON_LOG=/tmp/squadron-cf-daemon.log
CF_STATIC_LOG=/tmp/squadron-cf-static.log

kill_all() {
  pkill -f "bun --hot run daemon/index.ts" 2>/dev/null || true
  pkill -f "bun run daemon/index.ts"       2>/dev/null || true
  pkill -f "bun run scripts/static.ts"      2>/dev/null || true
  pkill -f "cloudflared tunnel --url http://localhost:7878" 2>/dev/null || true
  pkill -f "cloudflared tunnel --url http://localhost:8787" 2>/dev/null || true
  sleep 0.5
  echo "stopped"
}

if [[ "${1:-}" == "--kill" ]]; then
  kill_all
  exit 0
fi

# Avoid duplicates
kill_all >/dev/null

echo "[1/4] starting daemon (prod, no --hot)..."
( cd "$REPO" && nohup bun run daemon:prod > "$DAEMON_LOG" 2>&1 < /dev/null & disown )
for _ in {1..15}; do
  if curl -sS --max-time 1 http://localhost:7878/health >/dev/null 2>&1; then break; fi
  sleep 0.3
done
curl -sS http://localhost:7878/health || { echo "daemon failed — see $DAEMON_LOG"; exit 1; }
echo

echo "[2/4] starting static server..."
( cd "$REPO" && nohup bun run scripts/static.ts > "$STATIC_LOG" 2>&1 < /dev/null & disown )
for _ in {1..10}; do
  if curl -sS --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:8787/Squadron.html | grep -q 200; then break; fi
  sleep 0.3
done
echo "static: http://localhost:8787/Squadron.html"

if [[ "${SKIP_TUNNELS:-}" == "1" ]]; then
  echo
  echo "Done (local-only). Browser URL:"
  echo "  http://localhost:8787/Squadron.html?daemon=ws://localhost:7878/ws"
  exit 0
fi

echo "[3/4] starting cloudflared tunnel for daemon (7878)..."
nohup cloudflared tunnel --url http://localhost:7878 > "$CF_DAEMON_LOG" 2>&1 < /dev/null &
disown
echo "[4/4] starting cloudflared tunnel for static (8787)..."
nohup cloudflared tunnel --url http://localhost:8787 > "$CF_STATIC_LOG" 2>&1 < /dev/null &
disown

# Wait for both URLs
DAEMON_URL=""
STATIC_URL=""
for _ in {1..40}; do
  DAEMON_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$CF_DAEMON_LOG" | head -1 || true)
  STATIC_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$CF_STATIC_LOG" | head -1 || true)
  [[ -n "$DAEMON_URL" && -n "$STATIC_URL" ]] && break
  sleep 0.5
done

if [[ -z "$DAEMON_URL" || -z "$STATIC_URL" ]]; then
  echo "tunnel URL not detected within 20s — check $CF_DAEMON_LOG and $CF_STATIC_LOG"
  exit 1
fi

# Convert https:// → wss:// for the daemon URL
DAEMON_WS="${DAEMON_URL/https:/wss:}"

echo
echo "=== Squadron is up ==="
echo "Open in your browser:"
echo
echo "  $STATIC_URL/Squadron.html?daemon=$DAEMON_WS/ws"
echo
echo "Stop everything with:  bash scripts/bringup.sh --kill"
