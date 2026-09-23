#!/usr/bin/env bash
# deploy.sh — 一键部署前端到服务器(含验证)
# 用法: bash scripts/deploy.sh [--no-models]
# 功能: build → 上传完整 dist → 解到 /opt/gallery/ 根目录 → 清理旧 chunk → 同步 models → 重启 → 验证
# 注意:server.js 直接服务 /opt/gallery/assets/(不是 dist/assets/),必须解到根目录
#
# ⚠️ 模型盲区(2026-09-23 根治):Vite 只复制 public/ 进 dist,models/ **不在 dist 里**;
#    但 server.js 直接服务 /opt/gallery/models/,代码按 /models/xxx.glb 绝对路径加载。
#    此前换模型必须手工 scp,忘一次线上就缺模型 → 本脚本第 6 步用 rsync 增量同步 models/,
#    只传有变化的文件(495M 全量库不会每次重传)。加 --no-models 可跳过。
set -e
cd "$(dirname "$0")/.."
ROOT_DIR="$PWD"
KEY="/tmp/gk.pem"
HOST="101.133.235.110"
SYNC_MODELS=1
[ "$1" = "--no-models" ] && SYNC_MODELS=0

echo "=== 1/7 构建 ==="
rm -rf dist node_modules/.vite
npm run build 2>&1 | tail -3

echo "=== 2/7 准备密钥 ==="
awk '/BEGIN/{f=1} f{print} /END/{if(f)exit}' "C:/Users/17296/Desktop/梦幻画廊-交接笔记.md" | tr -d '\r' > "$KEY"
chmod 600 "$KEY"

echo "=== 3/7 打包并上传 ==="
tar -czf /tmp/dist.tar.gz -C dist .
scp -i "$KEY" -o StrictHostKeyChecking=no /tmp/dist.tar.gz "root@$HOST:/tmp/"

echo "=== 4/7 解压到服务目录 + 清理历史 chunk ==="
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

echo "=== 5/7 重启服务 ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" "pm2 restart gallery --update-env >/dev/null && sleep 2 && pm2 status gallery | grep -E 'gallery.*online'"

echo "=== 6/7 同步 models/(增量,只传变化的) ==="
if [ "$SYNC_MODELS" = "1" ]; then
  BEFORE=$(ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" "find /opt/gallery/models -type f -newermt '-2 minutes' 2>/dev/null | wc -l")
  rsync -az --delete --partial \
    -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    models/ "root@$HOST:/opt/gallery/models/"
  SRV_N=$(ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" "find /opt/gallery/models -type f | wc -l")
  LOC_N=$(find models -type f | wc -l)
  echo "本地模型 $LOC_N 个 / 服务器 $SRV_N 个"
  [ "$LOC_N" = "$SRV_N" ] && echo "✅ 模型数量一致" || echo "⚠️ 模型数量不一致,请检查"
else
  echo "(已用 --no-models 跳过)"
fi

echo "=== 7/7 验证线上 ==="
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