#!/usr/bin/env bash
# Squadron bootstrap installer for macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/m-luketin/squadron/main/install.sh | bash
#
# This installs the prerequisites (Bun + claude-code + cloudflared) then runs
# Squadron via `npx @m-luketin/squadron`. If you already have Bun, you can skip
# this script entirely — just run:
#
#   npx @m-luketin/squadron

set -euo pipefail

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

# 4. claude auth check
step "claude auth"
if claude auth status 2>&1 | grep -qiE "logged in|authenticated|active"; then
  ok "claude already logged in"
else
  warn "claude is not signed in."
  warn "Run this NOW in another terminal, then come back:"
  warn "  claude auth login"
  read -r -p "  press Enter when you've finished claude auth login… " _
fi

# 5. Hand off to npx
step "Starting Squadron via npx @m-luketin/squadron"
exec bunx @m-luketin/squadron
