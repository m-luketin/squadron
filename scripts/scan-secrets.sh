#!/usr/bin/env bash
# Pre-push secret/PII sweep.
# Scans every git-tracked file (i.e. only what we'd actually push) for:
#   - API key / token shapes (Anthropic, OpenAI, GitHub, AWS, JWTs, generic)
#   - Hardcoded user paths (/Users/<name>) and tunnel hostnames
#   - Real emails that aren't the project owner's
#   - "secret"/"password"/"api_key" assignments with a non-placeholder value
#   - Session IDs / runtime UUIDs that could leak active state
#
# Exits non-zero if any "blocking" finding is hit. Warnings (yellow) don't block.
#
#   bash scripts/scan-secrets.sh                    # scan tracked files
#   STRICT=1 bash scripts/scan-secrets.sh           # treat warnings as blocking
#
# Wired up as a pre-push hook by scripts/install-hooks.sh.

set -uo pipefail
cd "$(dirname "$0")/.."

OWNER_EMAIL="matija@solbound.dev"   # the only non-placeholder email allowed in source
OWNER_NAME_PATH="neo"               # /Users/<this> is what we should NOT see hardcoded
STRICT="${STRICT:-0}"

red()    { printf "\033[1;31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$1"; }
green()  { printf "\033[1;32m%s\033[0m\n" "$1"; }
info()   { printf "\033[1;36m▸ %s\033[0m\n" "$1"; }

BLOCKING=0
WARNINGS=0

# Grab the files that would actually be pushed. If git isn't initialized or there
# are no tracked files, fall back to a manifest of likely-shipped files.
if git rev-parse --git-dir >/dev/null 2>&1 && git ls-files | grep -q .; then
  FILES=$(git ls-files)
elif git rev-parse --git-dir >/dev/null 2>&1; then
  # Repo exists but nothing committed — scan staged + untracked-but-not-ignored.
  FILES=$( { git ls-files --cached; git ls-files --others --exclude-standard; } | sort -u )
else
  FILES=$(find . -type f -not -path "./node_modules/*" -not -path "./.git/*")
fi

# Filter out binary-ish files we don't care to grep.
SCANNABLE=$(echo "$FILES" | grep -Ev "\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|tar|gz|woff2?|ttf|otf|mp4|webm|mp3|wav|db|sqlite|lock)$" || true)

scan_count() {
  local label="$1"; local pattern="$2"; local severity="$3"; local extra_grep_flags="${4:-}"
  # shellcheck disable=SC2086
  local hits
  hits=$(echo "$SCANNABLE" | xargs -I{} grep -EnH $extra_grep_flags "$pattern" "{}" 2>/dev/null || true)
  if [[ -z "$hits" ]]; then
    return
  fi
  if [[ "$severity" == "block" ]]; then
    red "✗ BLOCKING: $label"
    BLOCKING=$((BLOCKING+1))
  else
    yellow "! warn: $label"
    WARNINGS=$((WARNINGS+1))
  fi
  echo "$hits" | head -10
  echo ""
}

info "Pre-push secret/PII scan"
echo ""

# 1. Live API key / token shapes (these almost certainly mean a real secret leaked)
scan_count "Anthropic API key (sk-ant-…)"   "sk-ant-[A-Za-z0-9_-]{20,}" block
scan_count "OpenAI / generic sk- key"        "sk-[A-Za-z0-9]{20,}"        block
scan_count "GitHub token (ghp_/ghs_/gho_/ghu_)" "gh[posu]_[A-Za-z0-9]{20,}" block
scan_count "AWS access key"                  "AKIA[0-9A-Z]{16}"           block
scan_count "JWT (eyJ…)"                      "eyJ[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}" block
scan_count "Slack token"                     "xox[baprs]-[A-Za-z0-9-]{20,}" block
scan_count "Google API key"                  "AIza[0-9A-Za-z_-]{30,}"     block
scan_count "Stripe live key"                 "sk_live_[A-Za-z0-9]{20,}"   block

# 2. Generic "secret" / "password" / "token" assignments with a >8-char value
#    (heuristic: catches things like API_KEY = "abc123…")
scan_count "credential-shaped assignment" \
  "(api[_-]?key|secret|password|access[_-]?token|bearer)\\s*[:=]\\s*['\"][A-Za-z0-9_+/=.-]{12,}['\"]" \
  warn "-i"

# 3. User-machine paths
scan_count "/Users/${OWNER_NAME_PATH} hardcoded paths" \
  "/Users/${OWNER_NAME_PATH}/" warn

# 4. Cloudflared quick-tunnel hostnames (these are user-specific + ephemeral)
scan_count "trycloudflare.com hostname (looks like a real ephemeral tunnel)" \
  "[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+\\.trycloudflare\\.com" warn

# 5. Real email addresses that aren't the owner's
ESCAPED_OWNER=$(printf '%s' "$OWNER_EMAIL" | sed 's/[][\\.*^$/]/\\&/g')
EMAIL_HITS=$(echo "$SCANNABLE" | xargs -I{} grep -EnH "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" "{}" 2>/dev/null \
  | grep -vE "(${ESCAPED_OWNER}|@example\.com|@domain\.com|@gmail\.com>|noreply@|.*\.d\.ts:|@noinline|users@.*\.org|opensource\.|microsoft\.com|github\.com)" \
  || true)
if [[ -n "$EMAIL_HITS" ]]; then
  yellow "! warn: unexpected email addresses (not ${OWNER_EMAIL}, not a placeholder)"
  echo "$EMAIL_HITS" | head -10
  echo ""
  WARNINGS=$((WARNINGS+1))
fi

# 6. SQLite agent IDs / session UUIDs in source (look like 8-4-4-4-12)
#    UUIDs are fine in tests/seeds; flagging only mass-occurrence in non-test files.
UUID_HITS=$(echo "$SCANNABLE" | xargs -I{} grep -El "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" "{}" 2>/dev/null | grep -v "test\|spec\|fixture" || true)
if [[ -n "$UUID_HITS" ]]; then
  yellow "! warn: UUIDs in non-test files (could be real agent/session IDs):"
  echo "$UUID_HITS" | sed 's/^/  /'
  echo ""
  WARNINGS=$((WARNINGS+1))
fi

# 7. Whitelist token state file — should never be in repo
WL_HIT=$(echo "$SCANNABLE" | grep -E "(\.hexagent/whitelist|whitelist\\.json)$" || true)
if [[ -n "$WL_HIT" ]]; then
  red "✗ BLOCKING: whitelist state file is being tracked"
  echo "$WL_HIT" | sed 's/^/  /'
  echo ""
  BLOCKING=$((BLOCKING+1))
fi

# 8. SQLite db files in repo (would leak agent/world data)
DB_HIT=$(echo "$SCANNABLE" | grep -E "\.(db|sqlite|sqlite3)(-shm|-wal)?$" || true)
if [[ -n "$DB_HIT" ]]; then
  red "✗ BLOCKING: SQLite files tracked (agent/world data)"
  echo "$DB_HIT" | sed 's/^/  /'
  echo ""
  BLOCKING=$((BLOCKING+1))
fi

# 9. .env files
ENV_HIT=$(echo "$SCANNABLE" | grep -E "(^|/)\\.env($|\\.)" || true)
if [[ -n "$ENV_HIT" ]]; then
  red "✗ BLOCKING: .env file tracked"
  echo "$ENV_HIT" | sed 's/^/  /'
  echo ""
  BLOCKING=$((BLOCKING+1))
fi

# 10. claude-code session / OAuth artifacts (just in case)
CLAUDE_ARTIFACT=$(echo "$SCANNABLE" | grep -E "(\\.credentials|oauth_token|claude-code/auth|keychain)" || true)
if [[ -n "$CLAUDE_ARTIFACT" ]]; then
  red "✗ BLOCKING: looks like a claude auth/credential artifact"
  echo "$CLAUDE_ARTIFACT" | sed 's/^/  /'
  echo ""
  BLOCKING=$((BLOCKING+1))
fi

# Summary
echo ""
if (( BLOCKING > 0 )); then
  red "FAIL: ${BLOCKING} blocking issue(s), ${WARNINGS} warning(s). Push refused."
  exit 1
fi
if (( WARNINGS > 0 )); then
  if [[ "$STRICT" == "1" ]]; then
    red "FAIL (STRICT mode): ${WARNINGS} warning(s) treated as blocking."
    exit 1
  fi
  yellow "OK with warnings: ${WARNINGS} warning(s). Review above."
  exit 0
fi
green "✓ Clean. No secrets/PII detected."
