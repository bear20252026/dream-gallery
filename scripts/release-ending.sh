#!/usr/bin/env bash
# release-ending.sh — 一次发布「先做结局」改动(2026-10-03)
# 顺序按 AGENTS.md 标准流程:测试 → 构建 → commit + push GitHub → deploy.sh 上服务器 → 线上验证。
# 任何一步失败立即停止(不会推送/部署半成品)。全部输出同时写入 .tmp/release-ending.log。
set -e -o pipefail
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"
mkdir -p .tmp
exec > >(tee .tmp/release-ending.log) 2>&1

echo "=== 1/5 检查分支与 GitHub 是否一致 ==="
git fetch origin
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "❌ 当前不在 main 分支,停止"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ 本地 main 与 GitHub 不一致,停止(请先处理)"; exit 1; }

echo "=== 2/5 单元测试 ==="
npx vitest run

echo "=== 3/5 生产构建(试构建,deploy.sh 会再构建一次) ==="
npm run build 2>&1 | tail -5

echo "=== 4/5 提交并推送 GitHub ==="
git add AGENTS.md scripts/release-ending.sh \
  src/__tests__/story-progress.test.js src/__tests__/ending-logic.test.js \
  src/core/av-switch.js src/core/gameshell-system.js src/core/world-loader.js src/ctx-scene.js \
  src/gate/consent-session.js src/gate/entrygate.js src/gate/scene3-night.js \
  src/gate/settings/chat-room.js src/gate/upload.js src/kunlun/planets.js src/main.js \
  src/scene/sheep-companion.js src/shared/story-progress.mjs src/shared/z-layers.mjs \
  src/state/store-api.js src/kunlun/ending-journey.js src/shared/ending-logic.mjs \
  src/shared/ending-text.mjs src/shared/legacy.mjs src/ui/book-pages.js
git commit -F .tmp/release-ending-msg.txt
git push origin main

echo "=== 5/5 部署到服务器 ==="
bash scripts/deploy.sh --no-models

echo ""
echo "RELEASE_OK $(git rev-parse --short HEAD)"
