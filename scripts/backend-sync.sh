#!/usr/bin/env bash
# backend-sync.sh — 把后端代码(server.js / lib/*.js / 后端 require 的共享模块)同步到服务器
# 用法:
#   bash scripts/backend-sync.sh --dry   只列出与服务器不同的文件和改动行数,什么都不改(退出码 0)
#   bash scripts/backend-sync.sh         列出差异 → 问 y/N → 备份 → 上传 → md5 复核 → 重启
#   bash scripts/backend-sync.sh --yes   不问,直接同步(给自动化 / 非交互终端用)
#   bash scripts/backend-sync.sh --check 只回答"后端与服务器是否一致":一致 exit 0,有差异 exit 5 并列出名单
#                                          (供 deploy.sh / release.sh 末尾的漂移复检机器判定;--dry 的输出是给人看的)
# deploy.sh 第 3 步会带着已准备好的 KEY 调用本脚本(BACKEND_SYNC_NO_RESTART=1,由 deploy.sh 统一重启)。
#
# ⚠️ 退出码契约(2026-10-12 修复"前后端部分部署成功"事故,调用方必须按它判断,不许再 `|| echo` 吞掉):
#   0 = 后端与服务器一致,或已上传并 md5 复核通过(**只有这两种才算成功**)
#   1 = 上传/md5 复核/重启出错
#   3 = 操作者在交互终端里明确回答 N(后端未上传)
#   4 = 需要确认但 stdin 不是终端(非交互),且没有显式 --yes —— 后端未上传
#   5 = --check:后端与服务器有差异(只读结论,什么都没改)
#   旧版在第 4 种情况下 `exit 0`,release.sh 于是当作成功继续上传前端,线上得到"新前端 + 旧后端"
#   (2026-10-11 实测事故)。静默的成功比响亮的失败危险得多,现在一律非 0 退出并点名授权开关。
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
# ⚠️ 凭据来源同 deploy.sh,只有两个受控路径:SSH_KEY/GIT_SSH_COMMAND 的 -i → ~/.ssh/gk-deploy.pem。
#    2026-10-12 删掉了"从桌面交接笔记 awk 出明文私钥写 /tmp"的第③条兜底(审计点名);
#    deploy.sh 调用时把 KEY 传进来,独立运行才走下面的解析。找不到就 exit 1,不做明文兜底。
set -e -o pipefail
cd "$(dirname "$0")/.."

DRY=0
YES=0
CHECK=0
for a in "$@"; do
  case "$a" in
    --dry) DRY=1 ;;
    --check) CHECK=1 ;;
    --yes|-y) YES=1 ;;
  esac
done
HOST="${HOST:-101.133.235.110}"
SRV="${SRV:-/opt/gallery}"
SSH_USER="${SSH_USER:-root}"
# SSH_BIN/SCP_BIN 只为"不碰生产"的演练/自测留的注入口(默认就是 ssh/scp,正常发布无需设置)
SSH_BIN="${SSH_BIN:-ssh}"
SCP_BIN="${SCP_BIN:-scp}"
ROOT_DIR="$PWD"
KNOWN_HOSTS="${KNOWN_HOSTS:-$ROOT_DIR/scripts/known_hosts}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/gallery-backups/backend}"
KEEP_BACKUP="${KEEP_BACKUP:-10}"

# 密钥:deploy.sh 传入则直接用;独立运行按优先级解析。
# ⚠️2026-10-12:删除"从桌面交接笔记 markdown 里 awk 出明文私钥写到 /tmp"的兜底(审计第二批
#   「清理部署私钥的明文回退路径」)。那个临时文件一旦脚本崩溃就留在世界可读目录里,而源头
#   本身就是把私钥明文存在桌面 md 文件中 —— 现在只接受两个受控来源,拿不到就硬失败。
if [ -z "$KEY" ]; then
  if [ -n "${SSH_KEY:-}" ] && [ -f "$SSH_KEY" ]; then
    KEY="$SSH_KEY"
  elif [ -f "$HOME/.ssh/gk-deploy.pem" ]; then
    KEY="$HOME/.ssh/gk-deploy.pem"
  else
    echo "❌ 无可用私钥:SSH_KEY 未设(或指向不存在的文件),且 ~/.ssh/gk-deploy.pem 不存在。"
    echo "   恢复:SSH_KEY=<私钥路径> bash scripts/backend-sync.sh   或把部署私钥放回 ~/.ssh/gk-deploy.pem(chmod 600)"
    exit 1
  fi
fi

# ssh/scp 参数(数组防空格);accept-new:首次信任、之后主机密钥变更即拒
SSH=("$SSH_BIN" -i "$KEY" -o StrictHostKeyChecking=accept-new)
SCP=("$SCP_BIN" -i "$KEY" -o StrictHostKeyChecking=accept-new)
if [ -f "$KNOWN_HOSTS" ]; then
  SSH+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
  SCP+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
fi
# SSHRO:只读取远端输出的调用一律加 -n —— 不带 -n 时 ssh 会把**本地 stdin** 抽走喂给远端,
# 交互式那一句 y/N 的输入就可能被前面某条 ssh 吃掉(read 拿到 EOF,在 set -e 下无声退出)。
# 需要往远端喂 stdin 的调用(heredoc 解包)必须继续用 SSH,不能加 -n。
SSHRO=("${SSH[@]}" -n)
TARGET="$SSH_USER@$HOST"

TMP=$(mktemp -d)
cleanup() {
  rm -rf "$TMP"
  return 0
}
trap cleanup EXIT

# 后端文件清单:server.js、lib/ 下全部 js、以及后端 require 的共享模块(决策表)
# 必须是一行、空格分隔:清单会拼进 ssh 命令,换行会被远端 shell 当成多条命令
FILES=$(echo server.js lib/*.js src/shared/mediarules.mjs)

# md5sum 分隔符跨平台不一致(Git Bash `<md5> *<路径>`,Linux 两个空格)→ 统一成单空格
norm() { awk '{ p=$2; sub(/^\*/,"",p); print $1" "p }'; }
# 先探活:连不上 / 目录不存在就明确失败。否则远端清单是空的,"空清单"会让下面的差集
# 把**每一个**本地文件都算成"与服务器不同",既不说明真实原因又可能误触发全量上传。
if ! "${SSHRO[@]}" "$TARGET" "test -d \"$SRV\" && echo ok" >/dev/null 2>&1; then
  echo "❌ ssh 连不上 $TARGET:$SRV(网络?私钥?主机密钥变了?目录名?)—— 后端状态**未知**,本次不算同步"
  exit 1
fi
md5sum $FILES | norm | sort -k2 > "$TMP/local.md5"
# 服务器上不存在的文件 md5sum 会报错,忽略即可(下面按"缺失"处理)
"${SSHRO[@]}" "$TARGET" "cd $SRV && md5sum $FILES 2>/dev/null; true" | norm | sort -k2 > "$TMP/srv.md5"

# 差集用 grep -vxF(整行精确匹配),**不要**用 awk 的 NR==FNR 技巧:
# 远端清单为空时 awk 会把第一份空文件当成"已见集合",于是每一条本地行都被判成"已见过",
# 结果 N=0 → 打印"✅ 后端与服务器一致"→ 什么都不传还报成功(又一处静默假绿,2026-10-12 查出)。
# grep -vxF -f <空文件> 的行为是"没有匹配模式",本地清单会整份落到 diff.list,即"全部待传"——失败方向正确。
# grep -vxF 的退出码本身就是结论:0=有差异行,1=一行都不差(真的一致),>1=出错(清单文件读不了)
# 不能写成 `grep ... || true`(那会把"出错"也洗成成功),也不能让它直接撞 set -e(1 是正常结论)
set +e
grep -vxF -f "$TMP/srv.md5" "$TMP/local.md5" > "$TMP/diff.raw"
GRC=$?
set -e
if [ "$GRC" -gt 1 ]; then
  echo "❌ 差异比较出错(grep exit $GRC)—— 无法判断后端状态,拒绝继续"
  exit 1
fi
awk '{print $2}' "$TMP/diff.raw" > "$TMP/diff.list"
LOC_LINES=$(wc -l < "$TMP/local.md5" | tr -d ' ')
if [ "$LOC_LINES" = "0" ]; then
  echo "❌ 本地后端清单为空(server.js / lib/*.js 一个都没读到)——无法判断差异,拒绝继续"
  exit 1
fi
if [ ! -s "$TMP/srv.md5" ]; then
  echo "ℹ️  服务器上还没有任何后端文件(首次部署?),按\"全部需要上传\"处理。"
fi
N=$(wc -l < "$TMP/diff.list" | tr -d ' ')
if [ "$N" = "0" ]; then
  echo "✅ 后端文件与服务器一致,无需上传(BACKEND_SYNC_RESULT=consistent)"
  exit 0
fi

# 取回服务器上这些文件的当前版本,逐个给出改动行数,便于发现"服务器上有、本地没有"的手工改动
LIST=$(tr '\n' ' ' < "$TMP/diff.list")
mkdir -p "$TMP/srv"
"${SSHRO[@]}" "$TARGET" "cd $SRV && tar -czf - --ignore-failed-read $LIST 2>/dev/null; true" | tar -xzf - -C "$TMP/srv" 2>/dev/null || true
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

if [ "$CHECK" = "1" ]; then
  # 机器可判定的"是否漂移"(--dry 给人看,退出码永远是 0,不能用作断言)
  echo "❌ 后端与服务器不一致:$N 个文件有差异(退出码 5)"
  exit 5
fi
if [ "$DRY" = "1" ]; then
  echo "(--dry:只列出,不做任何改动;后端仍未上传,调用方不要把这次发布算作完成)"
  exit 0
fi
if [ "$YES" != "1" ]; then
  if [ ! -t 0 ]; then
    # 这是 2026-10-11 事故的根因:旧版在这里 echo 一句然后 exit 0,
    # release.sh / deploy.sh 于是认为后端已同步,继续上传前端 → 线上"新前端 + 旧后端"。
    # 非交互必须是**显式授权**,绝不能隐式成功。
    echo "❌ 后端有 $N 个文件与服务器不同,但 stdin 不是交互终端,无法确认 —— 后端【未】上传。"
    echo "   这是硬失败(退出码 4):调用方必须中止,不得把本次发布算作成功。"
    echo "   要非交互授权本次同步:  bash scripts/backend-sync.sh --yes"
    echo "   只想看差异不动服务器:  bash scripts/backend-sync.sh --dry"
    echo "   整套发布走非交互:      bash scripts/release.sh --yes"
    echo "   人工交互处理:          在 Git Bash 终端里直接运行 bash scripts/backend-sync.sh"
    exit 4
  fi
  printf "上传这 %s 个文件到服务器?(先备份)[y/N] " "$N"
  read -r ans || ans=""
  case "$ans" in
    y|Y|yes) ;;
    *)
      echo "❌ 已明确拒绝:后端【未】上传(退出码 3)。服务器仍是旧后端,本次发布不算完成。"
      echo "   要继续:  bash scripts/backend-sync.sh --yes   或重新运行并在提示处回答 y"
      exit 3
      ;;
  esac
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

# md5 复核:上传后两边必须完全一致 —— 这一条才是"同步成功"的唯一凭据(不看 ssh 静默与否)
if ! "${SSHRO[@]}" "$TARGET" "cd $SRV && md5sum $LIST" | norm | sort -k2 > "$TMP/after.md5"; then
  echo "❌ 上传后无法读取服务器 md5(ssh 不通 / 文件不存在?)—— 后端状态**未知**,不要当作已部署"
  exit 1
fi
awk 'NR==FNR { want[$1]=1; next } ($2 in want)' "$TMP/diff.list" "$TMP/local.md5" | sort -k2 > "$TMP/want.md5"
if ! diff -q "$TMP/want.md5" "$TMP/after.md5" >/dev/null; then
  echo "❌ 上传后 md5 不一致,请手工检查(旧版本备份在 $BACKUP_ROOT,未落 web root)"
  diff "$TMP/want.md5" "$TMP/after.md5" || true
  exit 1
fi
echo "✅ $N 个后端文件已上传,md5 一致(BACKEND_SYNC_RESULT=uploaded)"

if [ "$BACKEND_SYNC_NO_RESTART" != "1" ]; then
  # kill-timeout 25000:后端 SHUTDOWN_DRAIN_MS 现 15000ms,9000 会在优雅排空途中 SIGKILL → 必须 > 排空时长
  # 判成败读的是远端 grep 的退出码(grep 在**远端**执行,管道也是远端的,本地 pipefail 管不到它,
  # 所以 ssh 的退出码就是远端命令的退出码 —— 这里没有"cmd | tail 的 $? 属于 tail"那个坑)
  if ! "${SSHRO[@]}" "$TARGET" "pm2 restart gallery --update-env --kill-timeout 25000 >/dev/null && sleep 2 && pm2 status gallery | grep -E 'gallery.*online'"; then
    echo "❌ 重启后 pm2 status 里没有 'gallery … online' —— 服务状态未知,立刻人工检查(代码已上传,进程可能没起来)"
    exit 1
  fi
  echo "✅ gallery 已重启,pm2 报告 online"
fi
