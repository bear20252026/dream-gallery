#!/usr/bin/env bash
# ship-branch.sh — publish a branch that another Claude session pushed to GitHub (2026-10-04)
# Usage: double-click ship-latest.bat (picks the newest claude/* branch on GitHub),
#        or in Git Bash: bash scripts/ship-branch.sh <branch-name>
# Steps: fetch GitHub -> fast-forward main to the branch -> unit tests -> build -> push main -> deploy.sh.
# Safe by design: only fast-forwards (never merges or rewrites history); if tests or the build fail
# before the push, main is moved back to where it was. Output goes to .tmp/ship.log.
set -e -o pipefail
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"
mkdir -p .tmp
exec > >(tee .tmp/ship.log) 2>&1

echo "=== 1/6 Fetch GitHub ==="
git fetch origin --prune
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "❌ Not on the main branch; stopping"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ Local main differs from GitHub main; stopping"; exit 1; }
BR="${1:-}"
if [ -z "$BR" ]; then
  BR=$(git for-each-ref --sort=-committerdate --format='%(refname:strip=3)' 'refs/remotes/origin/claude/*' | head -1)
fi
[ -n "$BR" ] || { echo "❌ No branch found to ship"; exit 1; }
echo "Branch: $BR"
NEW=$(git log --oneline "main..origin/$BR")
[ -n "$NEW" ] || { echo "Nothing new on $BR — main already has it"; exit 1; }
echo "$NEW"
git merge-base --is-ancestor main "origin/$BR" || { echo "❌ $BR is not based on the current main (cannot fast-forward); stopping"; exit 1; }

OLD=$(git rev-parse HEAD)
PUSHED=0
rollback() { if [ "$PUSHED" = "0" ]; then echo "↩ Moving main back to $OLD"; git reset -q --keep "$OLD" || true; fi; }
trap 'rollback' ERR

echo "=== 2/6 Fast-forward main ==="
git merge --ff-only "origin/$BR"

echo "=== 3/6 Unit tests ==="
npx vitest run

echo "=== 4/6 Production build ==="
npm run build 2>&1 | tail -5

echo "=== 5/6 Push main to GitHub ==="
git push origin main
PUSHED=1

echo "=== 6/6 Deploy to the server (with models sync) ==="
bash scripts/deploy.sh

echo ""
echo "SHIP_OK $(git rev-parse --short HEAD) ($BR)"
