#!/usr/bin/env bash
# release.sh — reusable release template (since 2026-10-03; generalized from release-ending.sh)
# Usage: run `bash scripts/release.sh` in Git Bash.
# Prerequisite: write this release's commit message to .tmp/release-msg.txt (first line is the title). Without it nothing is released.
# Order follows the standard flow in AGENTS.md: sync with GitHub -> unit tests -> build -> commit + push -> deploy.sh -> online verification.
# Any failing step stops immediately, so a half-finished build is never pushed or deployed. All output goes to .tmp/release.log.
#
# Only code directories are committed (src/ lib/ scripts/ types/ public/ and already-tracked root files).
# WARNING: the repository is public. Before committing, files that look like .env / private keys / certificates / names containing "私钥" (private key) or "secret" are blocked automatically.
set -e -o pipefail
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"
mkdir -p .tmp
exec > >(tee .tmp/release.log) 2>&1

MSG=.tmp/release-msg.txt
[ -s "$MSG" ] || { echo "❌ Missing $MSG (the commit message for this release); stopping"; exit 1; }

echo "=== 1/6 Check branch and GitHub are in sync ==="
git fetch origin
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "❌ Not on the main branch; stopping"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ Local main differs from GitHub; stopping (resolve this first)"; exit 1; }

echo "=== 2/6 Unit tests ==="
npx vitest run

echo "=== 3/6 Production build (trial) ==="
npm run build 2>&1 | tail -5

echo "=== 4/6 Stage changes and check them ==="
git add -u
for d in src lib scripts types public; do [ -d "$d" ] && git add "$d"; done
STAGED=$(git diff --cached --name-only)
[ -n "$STAGED" ] || { echo "❌ Nothing to commit; stopping"; exit 1; }
echo "$STAGED"
# Allowlist: the leak-prevention unit test itself (its file name contains "secret"; it was blocked by mistake on 2026-10-04)
if echo "$STAGED" | grep -v '^src/__tests__/no-secrets\.test\.js$' | grep -Eiq '(^|/)\.env|\.pem$|\.key$|\.p12$|\.pfx$|\.ppk$|私钥|secret'; then
  echo "❌ Staged files look like secrets; stopping (public repo!)"; git reset -q; exit 1
fi

echo "=== 5/6 Commit and push to GitHub ==="
git commit -F "$MSG"
git push origin main

echo "=== 6/6 Deploy to the server (including incremental models sync) ==="
bash scripts/deploy.sh

rm -f "$MSG"
echo ""
echo "RELEASE_OK $(git rev-parse --short HEAD)"
