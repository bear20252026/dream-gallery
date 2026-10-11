#!/usr/bin/env bash
# release.sh — reusable release template (since 2026-10-03; generalized from release-ending.sh)
# Usage: run `bash scripts/release.sh` in Git Bash.
# Prerequisite: write this release's commit message to .tmp/release-msg.txt (first line is the title). Without it nothing is released.
# Order follows the standard flow in AGENTS.md: sync with GitHub -> backend + unit tests -> build -> commit + push -> [wait for CI green] -> deploy.sh -> online verification.
# CI gate (added 2026-10-11): deploy is blocked until this commit's CI run reports conclusion=success. Bypass with --no-ci or SKIP_CI_GATE=1 (fails-closed default).
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

# --- CI gate (added 2026-10-11). Fail-closed by default: after git push we wait for THIS commit's CI
#     run to reach conclusion=success, and only then deploy. This flips release.sh from "deploy first,
#     CI verifies after the fact" into a real pre-deploy gate. --no-ci / SKIP_CI_GATE=1 is the escape hatch. ---
CI_GATE=1
for a in "$@"; do
  case "$a" in
    --no-ci) CI_GATE=0 ;;
    -h|--help)
      echo "用法: bash scripts/release.sh [--no-ci]"
      echo "  默认: 测试/构建/commit/push 之后,等本次 commit 的 CI(工作流 CI)跑绿才调用 deploy.sh。"
      echo "  --no-ci 或环境变量 SKIP_CI_GATE=1: 跳过 CI 闸门,直接部署(自担风险,输出里有明确警告)。"
      exit 0 ;;
  esac
done
[ "${SKIP_CI_GATE:-0}" = "1" ] && CI_GATE=0

# --help 可在没有 commit 信息时查看,故 MSG 检查放在参数解析之后
[ -s "$MSG" ] || { echo "❌ Missing $MSG (the commit message for this release); stopping"; exit 1; }

# 0 = 绿  1 = 红/未完成  2 = 无法确认(gh 缺失/未登录/离线/无 run)。三种非 0 全部阻断(fail-closed)。
ci_gate() {
  local SHA RID ST CONCL i
  SHA=$(git rev-parse HEAD)
  echo "待验证 commit: $SHA"
  if ! command -v gh >/dev/null 2>&1; then echo "❌ 本机没有 gh CLI,无法确认 CI → 默认阻断部署(要跳过用 --no-ci)。"; return 2; fi
  if ! gh auth status >/dev/null 2>&1; then echo "❌ gh 未登录/无凭据/离线,无法确认 CI → 默认阻断部署(要跳过用 --no-ci)。"; return 2; fi
  RID=""
  for i in $(seq 1 20); do
    RID=$(gh run list --commit "$SHA" --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
    { [ -n "$RID" ] && [ "$RID" != "null" ]; } && break
    echo "  …等本次 commit 的 CI run 登记 (${i}/20)"; sleep 6
  done
  if [ -z "$RID" ] || [ "$RID" = "null" ]; then echo "❌ 超时:GitHub 未为该 commit 生成 CI run(工作流没触发/网络?)→ 默认阻断部署。"; return 2; fi
  CI_RUN_ID="$RID"; export CI_RUN_ID
  echo "  找到 CI run: $RID,等待跑完…"
  CONCL=""
  for i in $(seq 1 60); do
    ST=$(gh run view "$RID" --json status --jq '.status' 2>/dev/null || true)
    if [ "$ST" = "completed" ]; then
      # 判定只读 conclusion 字段本身,绝不用管道退出码(AGENTS 血泪:cmd | tail 的 $? 属于 tail,不是命令)
      CONCL=$(gh run view "$RID" --json conclusion --jq '.conclusion' 2>/dev/null || true)
      break
    fi
    echo "  CI 进行中: status=${ST:-?} (${i}/60)"; sleep 15
  done
  if [ "$CONCL" = "success" ]; then echo "✅ CI 通过 (conclusion=success, run=$RID)"; return 0; fi
  echo "❌ CI 未通过或未在时限内完成 (conclusion=${CONCL:-<超时未跑完>}, run=$RID)。"
  echo "   查失败原因: gh run view $RID --log-failed   或   gh run view $RID --web"
  return 1
}

echo "=== 1/7 Check branch and GitHub are in sync ==="
git fetch origin
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "❌ Not on the main branch; stopping"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ Local main differs from GitHub; stopping (resolve this first)"; exit 1; }

echo "=== 2/7 Backend tests + unit tests ==="
npm test       # test-store.js (atomic saves) + test.js (backend 125) + test-mobile.js (mobile rendering) — the AGENTS.md pre-release suite
npx vitest run # frontend unit tests

echo "=== 3/7 Production build (trial) ==="
npm run build 2>&1 | tail -5

echo "=== 4/7 Stage changes and check them ==="
git add -u
for d in src lib scripts types public; do [ -d "$d" ] && git add "$d"; done
STAGED=$(git diff --cached --name-only)
[ -n "$STAGED" ] || { echo "❌ Nothing to commit; stopping"; exit 1; }
echo "$STAGED"
# Allowlist: the leak-prevention unit test itself (its file name contains "secret"; it was blocked by mistake on 2026-10-04),
# and .env.example (a values-free template — every assignment in it is intentionally empty; blocked by mistake on 2026-10-11
# because the guard's `(^|/)\.env` also matches the sample file that documents those very variables).
if echo "$STAGED" | grep -vE '^(src/__tests__/no-secrets\.test\.js|\.env\.example)$' | grep -Eiq '(^|/)\.env|\.pem$|\.key$|\.p12$|\.pfx$|\.ppk$|私钥|secret'; then
  echo "❌ Staged files look like secrets; stopping (public repo!)"; git reset -q; exit 1
fi

echo "=== 5/7 Commit and push to GitHub ==="
git commit -F "$MSG"
git push origin main

echo "=== 6/7 CI gate: only deploy after this commit's CI goes green ==="
if [ "$CI_GATE" = "1" ]; then
  if ci_gate; then
    echo "→ CI 绿,继续部署"
  else
    echo ""
    echo "=== 已停止:线上【未】更新。代码已 push 到 GitHub,只是没有部署。 ==="
    echo "   (闸门默认 fail-closed:CI 红/取不到/离线都不部署,避免把坏版本先推上线。)"
    echo "   想修好再发:  改完代码重跑 bash scripts/release.sh"
    echo "   确认要强行部署已推送的这个 commit(绕过闸门,后果自负):"
    echo "       bash scripts/deploy.sh        # 直接部署当前 HEAD(=刚 push 的 commit)"
    echo "   整条流水线带跳过重跑:  SKIP_CI_GATE=1 bash scripts/release.sh   (需重写 .tmp/release-msg.txt)"
    exit 1
  fi
else
  echo "⚠️⚠️⚠️ 已用 --no-ci / SKIP_CI_GATE=1 跳过 CI 闸门:线上将先发、CI 后验(甚至最终红)。这是有意的逃生门,后果自负。"
fi

echo "=== 7/7 Deploy to the server (including incremental models sync) ==="
bash scripts/deploy.sh

rm -f "$MSG"
echo ""
echo "RELEASE_OK $(git rev-parse --short HEAD)"
