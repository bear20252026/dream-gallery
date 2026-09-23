#!/usr/bin/env bash
# deploy.sh — 一键部署前端到服务器(含验证)
# 用法: bash scripts/deploy.sh [--no-models]
# 功能: build → 上传完整 dist → 解到 /opt/gallery/ 根目录 → 清理旧 chunk → 同步 models → 重启 → 验证
# 注意:server.js 直接服务 /opt/gallery/assets/(不是 dist/assets/),必须解到根目录
#
# ⚠️ 模型盲区(2026-09-23 根治):Vite 只复制 public/ 进 dist,models/ **不在 dist 里**;
#    但 server.js 直接服务 /opt/gallery/models/,代码按 /models/xxx.glb 绝对路径加载。
#    此前换模型必须手工 scp,忘一次线上就缺模型 → 本脚本第 6 步只补传"服务器没有的"文件。
#    ⚠️ 不用 rsync:Windows Git Bash 不带 rsync(实测 2026-09-23 `rsync: command not found`),
#    改用 md5 清单比对 + tar 打包上传,只用 ssh/scp/tar/find/md5sum 这些一定有的工具。
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

echo "=== 6/7 同步 models/(只补服务器缺的) ==="
# 2026-09-23:本步失败**不得阻断后续验证**(set -e 下曾因 rsync 缺失直接中止在第 6 步)。
# 模型是持久资产,漏传只影响新模型,不该让整个部署报错退出。
if [ "$SYNC_MODELS" = "1" ]; then
  _sync_models() {
  # 用 md5 清单找差集,不依赖 rsync(Windows Git Bash 没有)。
  # ⚠️ 关键坑(2026-09-23 实测):md5sum 的分隔符**跨平台不一致** ——
  #   Windows Git Bash 输出 `<md5> *<路径>`(二进制模式,带 `*`),
  #   GNU/Linux   输出 `<md5>  <路径>`(文本模式,两个空格)。
  # 直接比对会一行都对不上、每次全量重传 → 先统一成 `<md5> <路径>` 单空格再比。
  norm() { awk '{ p=$2; sub(/^\*/,"",p); print $1" "p }' "$1"; }
  ( cd models && find . -type f -print0 | xargs -0 md5sum ) 2>/dev/null | norm > /tmp/models_local.md5 || true
  ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" \
    "cd /opt/gallery/models 2>/dev/null && find . -type f -print0 | xargs -0 md5sum" \
    2>/dev/null | norm > /tmp/models_srv.md5 || true
  # 服务器已有且 md5 相同的行,从本地清单里剔除 → 剩下的就是"缺的或改过的"
  awk 'NR==FNR { seen[$0]=1; next } !seen[$0]' \
    /tmp/models_srv.md5 /tmp/models_local.md5 > /tmp/models_diff.md5 2>/dev/null || true
  DIFF_N=$(wc -l < /tmp/models_diff.md5 2>/dev/null | tr -d ' ')
  LOC_N=$(find models -type f | wc -l | tr -d ' ')
  echo "本地模型 $LOC_N 个 / 需补传 $DIFF_N 个"
  if [ "$DIFF_N" = "0" ]; then
    echo "✅ 模型已全部一致,无需上传"
  else
    # 只把这些文件打进 tar(495M 全量库不会每次重传)。
    # 清单已在上方 norm() 归一成 `<md5> <路径>`,这里只取路径。
    awk '{ $1=""; sub(/^ +/,""); print }' /tmp/models_diff.md5 > /tmp/models_diff.list
    ( cd models && tar -czf /tmp/models_patch.tar.gz -T /tmp/models_diff.list 2>/dev/null )
    if [ -s /tmp/models_patch.tar.gz ]; then
      scp -i "$KEY" -o StrictHostKeyChecking=no /tmp/models_patch.tar.gz "root@$HOST:/tmp/"
      ssh -i "$KEY" -o StrictHostKeyChecking=no "root@$HOST" \
        "cd /opt/gallery/models && tar -xzf /tmp/models_patch.tar.gz && rm -f /tmp/models_patch.tar.gz && echo '已解包'"
      echo "✅ 已补传 $DIFF_N 个模型文件"
    else
      echo "⚠️ 打包失败,请手工检查 models/"
    fi
  fi
  }
  _sync_models || echo "⚠️ 模型同步环节出错(不影响 dist 已上线),请手工核对 models/"
  rm -f /tmp/models_local.md5 /tmp/models_srv.md5 /tmp/models_diff.md5 /tmp/models_diff.list /tmp/models_patch.tar.gz
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