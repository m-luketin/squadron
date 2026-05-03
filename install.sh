#!/usr/bin/env bash
# Squadron one-shot installer for macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/squadron/main/install.sh | bash
#
# Or, with a custom install location:
#   SQUADRON_DIR=~/code/squadron curl -fsSL ... | bash
#
# What this does:
#   1. Installs Bun (if missing).
#   2. Installs the claude-code CLI globally via Bun (if missing).
#   3. Installs cloudflared via Homebrew (if missing — optional, only needed for
#      remote access; local-only mode works without it).
#   4. Clones https://github.com/<owner>/squadron to $SQUADRON_DIR (default ~/squadron).
#   5. Runs `bun install`.
#   6. Prompts you to sign in to claude (if you aren't already).
#   7. Starts the daemon + static + tunnels via `bun run up` and opens the URL
#      in your browser.

set -euo pipefail

REPO_URL="${SQUADRON_REPO:-https://github.com/m-luketin/squadron.git}"
SQUADRON_DIR="${SQUADRON_DIR:-$HOME/squadron}"

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$1"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  warn "This installer is tested on macOS. Linux likely works; Windows does not."
fi

# 1. Bun
step "Bun"
if command -v bun >/dev/null 2>&1; then
  ok "bun $(bun --version)"
else
  warn "bun not found — installing"
  curl -fsSL https://bun.sh/install | bash
  # shellcheck disable=SC1091
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  command -v bun >/dev/null 2>&1 || fail "bun install failed"
  ok "bun $(bun --version) installed"
fi

# 2. claude CLI
step "claude CLI"
if command -v claude >/dev/null 2>&1; then
  ok "claude $(claude --version 2>&1 | head -1)"
else
  warn "claude not found — installing via Bun"
  bun add -g @anthropic-ai/claude-code
  command -v claude >/dev/null 2>&1 || fail "claude install failed (try: bun add -g @anthropic-ai/claude-code)"
  ok "claude installed"
fi

# 3. cloudflared (optional)
step "cloudflared (optional — for remote access)"
if command -v cloudflared >/dev/null 2>&1; then
  ok "cloudflared $(cloudflared --version | head -1)"
else
  if command -v brew >/dev/null 2>&1; then
    warn "cloudflared not found — installing via Homebrew"
    brew install cloudflared || warn "cloudflared install failed; continuing in local-only mode"
  else
    warn "no Homebrew. Skipping cloudflared (Squadron will run in local-only mode)."
  fi
fi

# 4. Clone
step "Clone"
if [[ -d "$SQUADRON_DIR/.git" ]]; then
  ok "already cloned at $SQUADRON_DIR — pulling latest"
  ( cd "$SQUADRON_DIR" && git pull --ff-only ) || warn "pull failed; continuing with current checkout"
elif [[ -e "$SQUADRON_DIR" ]]; then
  fail "$SQUADRON_DIR exists and is not a git checkout. Set SQUADRON_DIR to a different path or remove it."
else
  if [[ "$REPO_URL" == *CHANGE_ME* ]]; then
    fail "REPO_URL is unset. Pass SQUADRON_REPO=<git-url> or edit install.sh."
  fi
  git clone "$REPO_URL" "$SQUADRON_DIR"
  ok "cloned to $SQUADRON_DIR"
fi

# 5. Deps
step "Install dependencies"
( cd "$SQUADRON_DIR" && bun install )
ok "deps installed"

# 6. claude auth check
step "claude auth"
if claude auth status 2>&1 | grep -qiE "logged in|authenticated|active"; then
  ok "claude already logged in"
else
  warn "claude is not signed in."
  warn "Run this NOW in another terminal, then come back:"
  warn "  claude auth login"
  read -r -p "  press Enter when you've finished claude auth login… " _
fi

# 7. Bring up
step "Starting Squadron"
cd "$SQUADRON_DIR"
if command -v cloudflared >/dev/null 2>&1; then
  bun run up
else
  SKIP_TUNNELS=1 bun run up
  open "http://localhost:8787/Squadron.html?daemon=ws://localhost:7878/ws" 2>/dev/null || true
fi

printf "\n\033[1;32m✓ Done.\033[0m If your browser didn't open, the URL was printed above.\n"
printf "  Stop everything with:  cd %s && bun run down\n" "$SQUADRON_DIR"
