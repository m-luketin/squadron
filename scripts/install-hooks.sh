#!/usr/bin/env bash
# Install git hooks for this repo. Runs the secret/PII scan before every push.
#
#   bash scripts/install-hooks.sh
#
# After installation, `git push` will run scripts/scan-secrets.sh first and
# refuse the push if anything blocking is found.

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d .git ]]; then
  echo "error: not a git repo. Run from the repo root." >&2
  exit 1
fi

mkdir -p .git/hooks
cat > .git/hooks/pre-push <<'EOF'
#!/usr/bin/env bash
# Squadron pre-push: refuse to push if scripts/scan-secrets.sh reports BLOCKING findings.
set -e
cd "$(git rev-parse --show-toplevel)"
if [[ -f scripts/scan-secrets.sh ]]; then
  bash scripts/scan-secrets.sh
fi
EOF
chmod +x .git/hooks/pre-push

echo "✓ pre-push hook installed at .git/hooks/pre-push"
echo "  every 'git push' now runs scripts/scan-secrets.sh first."
