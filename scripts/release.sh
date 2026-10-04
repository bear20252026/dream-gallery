#!/usr/bin/env bash
# release.sh — 通用发布模板(2026-10-03 起;由 release-ending.sh 改成可复用)
# 用法:双击仓库根目录的 release.bat,或在 Git Bash 里 `bash scripts/release.sh`
# 前提:.tmp/release-msg.txt 写好本次 commit 信息(第一行是标题)。没有它就不发布。
# 顺序按 AGENTS.md 标准流程:对齐 GitHub → 单元测试 → 构建 → commit + push → deploy.sh → 线上验证。
# 任何一步失败立即停止,不会推送/部署半成品。全部输出写入 .tmp/release.log。
#
# 只提交代码目录(src/ lib/ scripts/ types/ public/ 与根目录已跟踪文件)。
# ⚠️ 仓库是公开仓:提交前自动拦截 .env / 私钥 / 证书 / 「私钥」「secrets」字样的文件。
set -e -o pipefail
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"
mkdir -p .tmp
exec > >(tee .tmp/release.log) 2>&1

MSG=.tmp/release-msg.txt
[ -s "$MSG" ] || { echo "❌ 缺少 $MSG(本次提交说明),停止"; exit 1; }

echo "=== 1/6 检查分支与 GitHub 是否一致 ==="
git fetch origin
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "❌ 当前不在 main 分支,停止"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ 本地 main 与 GitHub 不一致,停止(请先处理)"; exit 1; }

echo "=== 2/6 单元测试 ==="
npx vitest run

echo "=== 3/6 生产构建(试构建) ==="
npm run build 2>&1 | tail -5

echo "=== 4/6 暂存改动并检查 ==="
git add -u
for d in src lib scripts types public; do [ -d "$d" ] && git add "$d"; done
STAGED=$(git diff --cached --name-only)
[ -n "$STAGED" ] || { echo "❌ 没有可提交的改动,停止"; exit 1; }
echo "$STAGED"
# 白名单:防泄露单测本身(文件名里带 secret 字样,2026-10-04 误拦)
if echo "$STAGED" | grep -v '^src/__tests__/no-secrets\.test\.js$' | grep -Eiq '(^|/)\.env|\.pem$|\.key$|\.p12$|\.pfx$|\.ppk$|私钥|secret'; then
  echo "❌ 暂存区里有疑似密钥文件,停止(公开仓!)"; git reset -q; exit 1
fi

echo "=== 5/6 提交并推送 GitHub ==="
git commit -F "$MSG"
git push origin main

echo "=== 6/6 部署到服务器(含 models 差量同步) ==="
bash scripts/deploy.sh

rm -f "$MSG"
echo ""
echo "RELEASE_OK $(git rev-parse --short HEAD)"
