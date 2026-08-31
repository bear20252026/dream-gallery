#!/usr/bin/env bash
# deploy.sh — 一键部署前端到服务器(含验证)
# 用法: bash scripts/deploy.sh
# 功能: build → 上传完整 dist → 解到 /opt/gallery/ 根目录 → 清理旧 chunk → 重启 → 验证
# 注意:server.js 直接服务 /opt/gallery/assets/(不是 dist/assets/),必须解到根目录
set -e
cd "$(dirname "$0")/.."
ROOT_DIR="$PWD"
KEY="/tmp/gk.pem"
HOST="101.133.235.110"

echo "=== 1/6 构建 ==="
rm -rf dist node_modules/.vite
npm run build 2>&1 | tail -3

echo "=== 2/6 准备密钥 ==="
awk '/BEGIN/{f=1} f{print} /END/{if(f)exit}' "C:/Users/17296/Desktop/梦幻画廊-交接笔记.md" | tr -d '\r' > "$KEY"
chmod 600 "$KEY"

echo "=== 3/6 打包并上传 ==="
tar -czf /tmp/dist.tar.gz -C dist .
scp -i "$KEY" -o StrictHostKeyChecking=no /tmp/dist.tar.gz "root@$HOST:/tmp/"

echo "=== 4/6 解压到服务目录 + 清理历史 chunk ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" bash -s <<'EOF'
cd /opt/gallery
tar -xzf /tmp/dist.tar.gz
rm -f /tmp/dist.tar.gz
# 清理:保留 index.html 当前引用的 chunk,删掉其余历史 main-*.js
KEEP=$(grep -oE '[A-Za-z0-9_-]+\.js' index.html | sort -u)
echo "保留文件: $KEEP"
for f in assets/main-*.js; do
  base=$(basename "$f")
  if ! echo "$KEEP" | grep -qF "$base"; then
    # 保留最近 3 个(按 mtime 降序),其余删
    :
  fi
done
# 只保留 mtime 最新的 3 个 main chunk(其余是历史堆积)
ls -t assets/main-*.js | tail -n +4 | xargs -r rm -f
echo "清理后 main chunk 数: $(ls assets/main-*.js | wc -l)"
EOF

echo "=== 5/6 重启服务 ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" "pm2 restart gallery --update-env >/dev/null && sleep 2 && pm2 status gallery | grep -E 'gallery.*online'"

echo "=== 6/6 验证线上 ==="
rm -f "$KEY"
echo "--- index.html 引用的 chunk ---"
curl -s "https://cloudbear.cloud/" | grep -oE 'main-[A-Za-z0-9_-]+\.js' | sort -u
echo "--- 本地 dist 的 chunk ---"
for f in dist/assets/main-*.js; do basename "$f"; done | sort
echo "--- 各 chunk HTTP 状态 ---"
for f in $(curl -s "https://cloudbear.cloud/" | grep -oE 'main-[A-Za-z0-9_-]+\.js' | sort -u); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://cloudbear.cloud/assets/$f")
  echo "$f -> $code"
done
echo ""
echo "=== 部署完成 ==="
echo "如果上方 HTTP 状态全为 200 且本地/线上 chunk 列表一致,说明同步正确"