#!/usr/bin/env bash
# backend-sync.sh — 把后端代码(server.js / lib/*.js / 后端 require 的共享模块)同步到服务器
# 用法:
#   bash scripts/backend-sync.sh --dry   只列出与服务器不同的文件和改动行数,什么都不改
#   bash scripts/backend-sync.sh         列出差异 → 问 y/N → 备份 → 上传 → md5 复核 → 重启
#   bash scripts/backend-sync.sh --yes   不问,直接同步(给自动化用)
# deploy.sh 第 5 步会带着已准备好的 KEY 调用本脚本(BACKEND_SYNC_NO_RESTART=1,由 deploy.sh 统一重启)。
#
# 为什么要有它(2026-10-05):后端文件不进 dist,以前全靠手工 scp,
# 漏传一次线上就和本地不一致(实测 lib/config.js 线上缺 .glb 等四行 MIME,漂移了十几天)。
# 与模型同步同一套做法:md5 清单比差集,只用 ssh/scp/tar/md5sum,不用 rsync(Windows Git Bash 没有)。
#
# ⚠️ 备份绝不落 web root(2026-10-11):旧版把备份写成 /opt/gallery/<文件>.bak-<时间戳>,
#    这类名字不以 .js 结尾、老的 \.(bak|cjs)$ 结尾锚也挡不住 → 后端源码被 serveStatic 以 octet-stream 公网回传。
#    lib/security.js 的根级兜底(OPS-004)只放行 ROOT_PUBLIC_* 登记表内文件,拿不准的一律 404;
#    但从源头治理更稳妥:备份写到 web root **之外**的 $BACKUP_ROOT(/opt/gallery-backups/backend),
#    文件名带上原相对路径(server.js 与 lib/config.js 才不会撞名)。
#
# ⚠️ 凭据优先级同 deploy.sh:SSH_KEY/GIT_SSH_COMMAND → ~/.ssh/gk-deploy.pem → 桌面交接笔记(兜底临时文件)。
#    deploy.sh 调用时会把 KEY 传进来(OWN_KEY=0,不在这里删);独立运行才走下面的解析并按需清理临时文件。
set -e -o pipefail
cd "$(dirname "$0")/.."

DRY=0
YES=0
for a in "$@"; do
  case "$a" in
    --dry) DRY=1 ;;
    --yes) YES=1 ;;
  esac
done
HOST="${HOST:-101.133.235.110}"
SRV="${SRV:-/opt/gallery}"
SSH_USER="${SSH_USER:-root}"
ROOT_DIR="$PWD"
KNOWN_HOSTS="${KNOWN_HOSTS:-$ROOT_DIR/scripts/known_hosts}"
HANDOVER_NOTE="${HANDOVER_NOTE:-C:/Users/17296/Desktop/梦幻画廊-交接笔记.md}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/gallery-backups/backend}"
KEEP_BACKUP="${KEEP_BACKUP:-10}"

# 密钥:deploy.sh 传入则直接用;独立运行按优先级解析
if [ -z "$KEY" ]; then
  OWN_KEY=0
  if [ -n "${SSH_KEY:-}" ] && [ -f "$SSH_KEY" ]; then
    KEY="$SSH_KEY"
  elif [ -f "$HOME/.ssh/gk-deploy.pem" ]; then
    KEY="$HOME/.ssh/gk-deploy.pem"
  else
    [ -f "$HANDOVER_NOTE" ] || { echo "❌ 无可用私钥(SSH_KEY 未设、~/.ssh/gk-deploy.pem 不存在、交接笔记也不在 $HANDOVER_NOTE)"; exit 1; }
    KEY=/tmp/gk-backend.pem; OWN_KEY=1
    awk '/BEGIN/{f=1} f{print} /END/{if(f)exit}' "$HANDOVER_NOTE" | tr -d '\r' > "$KEY"
    chmod 600 "$KEY"
  fi
else
  OWN_KEY=0
fi

# ssh/scp 参数(数组防空格);accept-new:首次信任、之后主机密钥变更即拒
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)
if [ -f "$KNOWN_HOSTS" ]; then
  SSH+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
  SCP+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
fi
TARGET="$SSH_USER@$HOST"

TMP=$(mktemp -d)
cleanup() {
  rm -rf "$TMP"
  [ "$OWN_KEY" = "1" ] && rm -f "$KEY"
  return 0
}
trap cleanup EXIT

# 后端文件清单:server.js、lib/ 下全部 js、以及后端 require 的共享模块(决策表)
# 必须是一行、空格分隔:清单会拼进 ssh 命令,换行会被远端 shell 当成多条命令
FILES=$(echo server.js lib/*.js src/shared/mediarules.mjs)

# md5sum 分隔符跨平台不一致(Git Bash `<md5> *<路径>`,Linux 两个空格)→ 统一成单空格
norm() { awk '{ p=$2; sub(/^\*/,"",p); print $1" "p }'; }
md5sum $FILES | norm | sort -k2 > "$TMP/local.md5"
# 服务器上不存在的文件 md5sum 会报错,忽略即可(下面按"缺失"处理)
"${SSH[@]}" "$TARGET" "cd $SRV && md5sum $FILES 2>/dev/null; true" | norm | sort -k2 > "$TMP/srv.md5"

awk 'NR==FNR { seen[$0]=1; next } !seen[$0] { print $2 }' "$TMP/srv.md5" "$TMP/local.md5" > "$TMP/diff.list"
N=$(wc -l < "$TMP/diff.list" | tr -d ' ')
if [ "$N" = "0" ]; then
  echo "✅ 后端文件与服务器一致,无需上传"
  exit 0
fi

# 取回服务器上这些文件的当前版本,逐个给出改动行数,便于发现"服务器上有、本地没有"的手工改动
LIST=$(tr '\n' ' ' < "$TMP/diff.list")
mkdir -p "$TMP/srv"
"${SSH[@]}" "$TARGET" "cd $SRV && tar -czf - --ignore-failed-read $LIST 2>/dev/null; true" | tar -xzf - -C "$TMP/srv" 2>/dev/null || true
echo "与服务器不同的后端文件 $N 个:"
while read -r f; do
  if [ -f "$TMP/srv/$f" ]; then
    add=$(diff "$TMP/srv/$f" "$f" | grep -c '^>' || true)
    del=$(diff "$TMP/srv/$f" "$f" | grep -c '^<' || true)
    echo "  $f   (+$add 行 / -$del 行;'-' 是只在服务器上有的行)"
  else
    echo "  $f   (服务器上还没有,新文件)"
  fi
done < "$TMP/diff.list"

if [ "$DRY" = "1" ]; then
  echo "(--dry:只列出,不做任何改动)"
  exit 0
fi
if [ "$YES" != "1" ]; then
  if [ ! -t 0 ]; then
    echo "⚠️ 不是交互终端,跳过后端同步。要同步请单独运行: bash scripts/backend-sync.sh"
    exit 0
  fi
  printf "上传这 %s 个文件到服务器?(先备份)[y/N] " "$N"
  read -r ans
  case "$ans" in y|Y|yes) ;; *) echo "已跳过后端同步"; exit 0 ;; esac
fi

# 打包本地版本 → 服务器上先给旧文件加时间戳备份(写到 web root 之外)→ 解包
tar -czf "$TMP/backend.tar.gz" -T "$TMP/diff.list"
"${SCP[@]}" "$TMP/backend.tar.gz" "$TARGET:/tmp/backend-sync.tar.gz"
echo "备份将写入:$BACKUP_ROOT(保留最近 $KEEP_BACKUP 份;绝不落 web root)"
"${SSH[@]}" "$TARGET" bash -s <<EOF
set -e
cd $SRV
TS=\$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT="$BACKUP_ROOT"
mkdir -p "\$BACKUP_ROOT"
for f in $LIST; do
  if [ -f "\$f" ]; then
    flat=\$(printf '%s' "\$f" | tr '/' '_')
    cp -p "\$f" "\$BACKUP_ROOT/\$flat-\$TS"
    echo "  备份 \$f -> \$BACKUP_ROOT/\$flat-\$TS"
  fi
done
tar -xzf /tmp/backend-sync.tar.gz
rm -f /tmp/backend-sync.tar.gz
# 只留最近 $KEEP_BACKUP 份(全局按 mtime 降序),更旧的清理掉
ls -1t "\$BACKUP_ROOT" 2>/dev/null | tail -n +$((KEEP_BACKUP+1)) | while read -r old; do rm -f "\$BACKUP_ROOT/\$old"; done
echo "已在 web root 外备份(留最近 $KEEP_BACKUP 份)并上传"
EOF

# md5 复核:上传后两边必须完全一致
"${SSH[@]}" "$TARGET" "cd $SRV && md5sum $LIST" | norm | sort -k2 > "$TMP/after.md5"
awk 'NR==FNR { want[$1]=1; next } ($2 in want)' "$TMP/diff.list" "$TMP/local.md5" | sort -k2 > "$TMP/want.md5"
if ! diff -q "$TMP/want.md5" "$TMP/after.md5" >/dev/null; then
  echo "❌ 上传后 md5 不一致,请手工检查(旧版本备份在 $BACKUP_ROOT,未落 web root)"
  exit 1
fi
echo "✅ $N 个后端文件已上传,md5 一致"

if [ "$BACKEND_SYNC_NO_RESTART" != "1" ]; then
  # kill-timeout 25000:后端 SHUTDOWN_DRAIN_MS 现 15000ms,9000 会在优雅排空途中 SIGKILL → 必须 > 排空时长
  "${SSH[@]}" "$TARGET" "pm2 restart gallery --update-env --kill-timeout 25000 >/dev/null && sleep 2 && pm2 status gallery | grep -E 'gallery.*online'"
fi
