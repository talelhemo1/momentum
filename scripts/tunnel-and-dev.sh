#!/usr/bin/env bash
# Public dev tunnel for Momentum.
#
# Why this exists:
#   When the dev server runs on localhost, every RSVP/WhatsApp link the host
#   sends contains "http://localhost:<port>/...". The guest's phone has
#   nothing on its own localhost, so the link opens blank. This script spins
#   up a cloudflared "quick tunnel" — a public https URL that proxies to
#   your localhost — writes it into .env.local as NEXT_PUBLIC_SITE_URL, and
#   then starts the dev server. Result: every link the app emits becomes
#   openable from any device, anywhere.
#
# Usage:
#   npm run dev:public
#
# Override the port if needed:
#   PORT=3000 npm run dev:public
#
# Press Ctrl+C to stop both the tunnel and the dev server cleanly.

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

PORT="${PORT:-3030}"
ENV_FILE="$PROJECT_ROOT/.env.local"
LOG_FILE="$(mktemp -t momentum-tunnel.XXXXXX)"
LOCAL_BIN="$PROJECT_ROOT/bin/cloudflared"

# Locate cloudflared. Prefer the project-local binary (downloaded once on
# first run, never committed) so contributors don't need brew or sudo. Fall
# back to anything on PATH so power users with a system install still work.
CLOUDFLARED=""
if [ -x "$LOCAL_BIN" ]; then
  CLOUDFLARED="$LOCAL_BIN"
elif command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED="$(command -v cloudflared)"
else
  # Auto-install: download the binary into bin/ for darwin (arm64 or amd64).
  # No sudo, no Homebrew, no system pollution. Fail fast on other OSes —
  # the user can install manually and re-run.
  ARCH="$(uname -sm)"
  TGZ_URL=""
  case "$ARCH" in
    "Darwin arm64")
      TGZ_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
      ;;
    "Darwin x86_64")
      TGZ_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
      ;;
    *)
      echo "❌ cloudflared isn't installed and we don't auto-install for: $ARCH"
      echo "   Install manually: https://github.com/cloudflare/cloudflared/releases"
      exit 1
      ;;
  esac
  echo "📦 cloudflared not found — downloading project-local copy..."
  mkdir -p "$PROJECT_ROOT/bin"
  TMP_TGZ="$(mktemp -t momentum-cf.XXXXXX).tgz"
  if ! curl -fsSL "$TGZ_URL" -o "$TMP_TGZ"; then
    echo "❌ Failed to download cloudflared from $TGZ_URL"
    rm -f "$TMP_TGZ"
    exit 1
  fi
  tar -xzf "$TMP_TGZ" -C "$PROJECT_ROOT/bin"
  rm -f "$TMP_TGZ"
  chmod +x "$LOCAL_BIN"
  CLOUDFLARED="$LOCAL_BIN"
  echo "✅ Installed: $CLOUDFLARED"
fi

# Start the tunnel in the background and capture its output.
echo "🚀 Starting cloudflared tunnel to http://localhost:$PORT ..."
"$CLOUDFLARED" tunnel --no-autoupdate --url "http://localhost:$PORT" > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

# Cleanup on exit/interrupt — kill the tunnel and remove the log.
cleanup() {
  echo ""
  echo "🧹 Stopping tunnel (pid $TUNNEL_PID) ..."
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
  rm -f "$LOG_FILE"
}
trap cleanup EXIT INT TERM

# Wait for the public URL to appear in the log (up to 45s).
echo "⏳ Waiting for public URL (up to 45 seconds) ..."
URL=""
for i in $(seq 1 45); do
  URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" | head -1)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "❌ Could not find tunnel URL after 45 seconds. Tunnel logs:"
  echo "----------"
  cat "$LOG_FILE"
  echo "----------"
  exit 1
fi

echo "✅ Public URL ready: $URL"

# Make sure .env.local exists, then upsert NEXT_PUBLIC_SITE_URL.
touch "$ENV_FILE"
if grep -q "^NEXT_PUBLIC_SITE_URL=" "$ENV_FILE"; then
  # macOS sed requires a backup-suffix arg after -i; we use .bak for portability and remove .bak.
  sed -i.bak "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=$URL|" "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
else
  # Append with a leading newline so we don't merge into an existing line.
  printf '\nNEXT_PUBLIC_SITE_URL=%s\n' "$URL" >> "$ENV_FILE"
fi

echo "✅ Updated NEXT_PUBLIC_SITE_URL in .env.local"
echo ""
echo "════════════════════════════════════════════════════════════"
echo " 🌍 Public URL:   $URL"
echo " 📱 Open it on your phone to test from outside the LAN"
echo " 💬 Every WhatsApp link the app sends now uses this URL"
echo " 🛑 Press Ctrl+C to stop the dev server AND the tunnel"
echo "════════════════════════════════════════════════════════════"
echo ""

# Hand control to the dev server. Cleanup trap kills the tunnel when this exits.
# Pass the port explicitly so the dev server matches the tunnel target.
exec npm run dev -- -p "$PORT"
