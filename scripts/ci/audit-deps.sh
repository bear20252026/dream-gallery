#!/usr/bin/env bash
# scripts/ci/audit-deps.sh — 依赖漏洞扫描(CI 用)。**先做"报告不阻断"**(exit 0)。
# 为什么默认不阻断:npm audit 会因上游新公告频繁变红(与本仓代码无关),硬闸会让主在单人开发时
# 被第三方公告卡死发布。所以 CI 里只打印,想升级/知情即可。将来若要收紧,把末尾 exit 交给调用方判断。
# 只读扫描,不装任何东西、不联网改 lock(只有 `npm audit`/`pnpm audit` 本身会联网取公告)。
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH="/c/Program Files/nodejs:$PATH"   # CI(Ubuntu)里是无害 no-op
FAIL=0

echo "== npm audit (root, audit-level=high) =="
if npm audit --audit-level=high; then
  echo "root npm audit: 无 high/critical"
else
  echo "root npm audit: 有 high/critical 公告(不阻断,仅供知情)"
fi

echo "== pnpm audit (hill-src, if pnpm present) =="
if [ -d hill-src ] && command -v pnpm >/dev/null 2>&1; then
  if ! ( cd hill-src && pnpm audit --audit-level=high ); then
    echo "hill-src pnpm audit: 有 high/critical 公告(不阻断)"
  fi
else
  echo "(跳过 hill-src pnpm audit:无 pnpm 或无 hill-src)"
fi

exit 0
