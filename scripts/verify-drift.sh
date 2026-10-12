#!/usr/bin/env bash
# verify-drift.sh — 发布后复核"服务器上的文件"与"本地这次要发的文件"是否逐字节一致(漂移检查)
#
# 用法:
#   bash scripts/verify-drift.sh              比对 后端(清单 = scripts/backend-files.sh)+ 前端(dist/ 全量)
#   bash scripts/verify-drift.sh --backend-only  只比后端(release.sh 收尾用的独立二次确认)
#   bash scripts/verify-drift.sh --dist-only     只比前端
#   bash scripts/verify-drift.sh --pin-hostkey    转交 deploy.sh 抓主机密钥(只生成信任锚,不比对)
#   HOST=… SSH_USER=… SRV=… bash scripts/verify-drift.sh
#
# 退出码(调用方必须读退出码,不许"没报错就当过了"):
#   0 = 全部一致(逐项比对完成)
#   1 = 有漂移:服务器缺文件 / 内容不一致  —— 部署是半成品,必须当作失败
#   2 = 无法比对:连不上、本地 dist 不存在、清单为空 —— 同样是失败(状态未知不等于成功)
#
# 为什么两边都要 tr -d '\r'(本仓踩过的坑):
#   本地 Windows 工作区是 CRLF,服务器是 LF。直接 md5/diff 会得到"整文件都不同"的假阳性。
#   此前人工核对本地 vs 生产用的就是
#       diff <(git show HEAD:$f | tr -d '\r') <(tr -d '\r' < /path/on/server/$f)
#   这里把同一口径固化进脚本:**两侧**都剥掉 \r 再算 md5。
#
#  SSH 参数与 deploy.sh / backend-sync.sh 完全一致:StrictHostKeyChecking=accept-new,
#  信任锚用仓库内 scripts/known_hosts(存在才加 -o UserKnownHostsFile),私钥按
#  SSH_KEY/GIT_SSH_COMMAND 的 -i → ~/.ssh/gk-deploy.pem 的优先级解析(2026-10-12 起已删掉
#  "从桌面交接笔记抽明文私钥写 /tmp"那条兜底:拿不到受控私钥就 exit 2,不做明文兜底)。
#  本脚本**只读**远端,不写、不重启、不碰 .env / gate_data.*(数据与凭据按 AGENTS 明文属人工范围)。
#  SSH_BIN/SCP_BIN 只是"绝不碰生产"的演练注入口,正常发布不要设。
set -e -o pipefail
cd "$(dirname "$0")/.."
ROOT_DIR="$PWD"
HOST="${HOST:-101.133.235.110}"
SRV="${SRV:-/opt/gallery}"
SSH_USER="${SSH_USER:-root}"
SSH_BIN="${SSH_BIN:-ssh}"
SCP_BIN="${SCP_BIN:-scp}"
KNOWN_HOSTS="${KNOWN_HOSTS:-$ROOT_DIR/scripts/known_hosts}"

CHECK_BACKEND=1
CHECK_DIST=1
DO_PIN=0
for a in "$@"; do
  case "$a" in
    --backend-only) CHECK_DIST=0 ;;
    --dist-only) CHECK_BACKEND=0 ;;
    --pin-hostkey) DO_PIN=1 ;;
    -h|--help)
      echo "用法: bash scripts/verify-drift.sh [--backend-only|--dist-only] [--pin-hostkey]"
      echo "  比对本地要发布的文件与服务器上的同名文件(\$SRV,默认 /opt/gallery),CRLF 两侧归一后比 md5。"
      echo "  退出码 0=一致 / 1=有漂移 / 2=无法比对(后两者都要当失败处理)。"
      echo "  环境变量:HOST SSH_USER SRV KNOWN_HOSTS SSH_KEY SSH_BIN SCP_BIN"
      exit 0 ;;
  esac
done

# --pin-hostkey:信任锚的生成逻辑只在 deploy.sh 一处,直接转交,别在这里重写第二份
if [ "$DO_PIN" = "1" ]; then
  exec bash scripts/deploy.sh --pin-hostkey
fi

# ---- 私钥解析(与 deploy.sh/backend-sync.sh 同一口径:只有两个受控来源,2026-10-12 删掉明文兜底) ----
if [ -z "${KEY:-}" ]; then
  if [ -n "${SSH_KEY:-}" ] && [ -f "$SSH_KEY" ]; then
    KEY="$SSH_KEY"
  elif [ -n "${GIT_SSH_COMMAND:-}" ]; then
    k=$(printf '%s' "$GIT_SSH_COMMAND" | awk '{for(i=1;i<NF;i++) if($i=="-i"){print $(i+1); exit}}' | tr -d "\"'")
    if [ -n "$k" ] && [ -f "$k" ]; then KEY="$k"; else KEY=""; fi
    [ -n "$KEY" ] || { echo "❌ SSH_KEY 未设、GIT_SSH_COMMAND 里的 -i 指向的文件不存在、~/.ssh/gk-deploy.pem 也不在"; exit 2; }
  elif [ -f "$HOME/.ssh/gk-deploy.pem" ]; then
    KEY="$HOME/.ssh/gk-deploy.pem"
  else
    echo "❌ 无可用私钥:SSH_KEY 未设且 ~/.ssh/gk-deploy.pem 不存在 —— 无法比对(退出码 2,不是成功)。"
    echo "   恢复:SSH_KEY=<私钥路径> bash scripts/verify-drift.sh   或把部署私钥放回 ~/.ssh/gk-deploy.pem"
    exit 2
  fi
fi
[ -f "$KEY" ] || { echo "❌ 私钥文件不存在:$KEY —— 无法比对(退出码 2,不是成功)"; exit 2; }

SSH=("$SSH_BIN" -i "$KEY" -o StrictHostKeyChecking=accept-new)
if [ -f "$KNOWN_HOSTS" ]; then
  SSH+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
fi
# 探活/取清单之外不需要本地 stdin 的调用一律 -n,免得吃掉交互终端的输入
SSHRO=("${SSH[@]}" -n)
TARGET="$SSH_USER@$HOST"

TMP=$(mktemp -d)
cleanup() {
  rm -rf "$TMP"
  return 0
}
trap cleanup EXIT

# ---- 1) 组装比对清单:<本地路径>\t<服务器相对路径> ----
PAIRS="$TMP/pairs.list"
: > "$PAIRS"
if [ "$CHECK_BACKEND" = "1" ]; then
  # 清单与 backend-sync.sh 同一份出处(scripts/backend-files.sh)。
  # 这里曾写死 `lib/*.js` ⇒ R1/R2 拆出的 lib/repo、lib/upload、lib/migrations 既没被同步、
  # 也没被复核,漂移检查会对"线上根本没有这些模块"报一致 —— 比而不见等于没比。
  . scripts/backend-files.sh
  # 先确认这份清单覆盖真实依赖,再去比 md5:清单漏了目录时"一致"是假的(见该文件头注)。
  if ! node scripts/admin/check-backend-manifest.cjs; then
    echo "❌ 后端清单自检未通过(或无法判定)—— 没有一份可信的清单,漂移复核无从谈起"
    exit 2
  fi
  while IFS= read -r f; do
    [ -f "$f" ] && printf '%s\t%s\n' "$f" "$f" >> "$PAIRS"
  done < <(backend_files)
fi
if [ "$CHECK_DIST" = "1" ]; then
  if [ ! -d dist ]; then
    echo "❌ 本地没有 dist/ —— 前端无从比对(先 npm run build,或 --backend-only 只比后端)"
    exit 2
  fi
  # dist/.vite/ 是 Vite 的构建期元数据(SSR manifest),运行时不取用,列进来只会造成"服务器没这目录"的假漂移
  while IFS= read -r f; do
    printf '%s\t%s\n' "$f" "${f#dist/}" >> "$PAIRS"
  done < <(find dist -type f -not -path 'dist/.vite/*' -not -path 'dist/.vite' | sort)
fi
TOTAL=$(wc -l < "$PAIRS" | tr -d ' ')
if [ "$TOTAL" = "0" ]; then
  echo "❌ 比对清单为空(一个可比文件都没有)—— 这是「没比」,不是「一致」"
  exit 2
fi
# 含空白/引号/反斜杠的路径会让远端 while-read 错位 → 明确失败,不给一个可能假绿的比对
# 清单本身就是 <本地>\t<服务器相对路径>,所以逐字段检查,不能整行检查(\t 是分隔符不是路径字符)
# (\042 = 双引号,\047 = 单引号;避开 shell 嵌套引号)
if awk -F'\t' '{ for (i=1; i<=NF; i++) if ($i ~ /[ \042\047\\]/) bad=1 } END{exit bad?0:1}' "$PAIRS"; then
  echo "❌ 比对清单里有含空格/引号/反斜杠的文件名,拒绝比对(避免远端解析错位造成假通过)"
  awk -F'\t' '{ for (i=1; i<=NF; i++) if ($i ~ /[ \042\047\\]/) { print "    " $i; exit } }' "$PAIRS"
  exit 2
fi
echo "=== 漂移复核:$TOTAL 个文件(两侧都剥 \\r 之后比 md5) ==="
echo "    本地根: $ROOT_DIR"
echo "    服务器: $TARGET:$SRV"

# ---- 2) 本地摘要(CRLF 归一) ----
# 逐个文件 fork tr+md5sum+cut 在 Windows Git Bash 上太慢(171 个文件实测 2 分半,几乎全是进程启动开销)。
# 绝大多数文件本来就不含 \r,原始 md5 与剥 \r 后的 md5 等价 ⇒ 先一次 grep 找出"真含 CR 的文件",
# 其余一次 md5sum 批量算完;只有含 CR 的少数(通常是 Windows 下生成的 html)才逐文件剥 \r。
LOCAL_MD5="$TMP/local.md5"
LOCAL_PATHS="$TMP/local.paths"
CUT_PATHS="$TMP/cr.paths"
PLAIN_PATHS="$TMP/plain.paths"
cut -f1 "$PAIRS" > "$LOCAL_PATHS"
# grep -l 一批里没匹配就退 1,xargs 再把"任一批退 1"汇总成 123 —— 三个都是正常结论,不是错误
set +e
xargs -d '\n' -n 50 grep -lU $'\r' -- < "$LOCAL_PATHS" > "$CUT_PATHS" 2>/dev/null
GR=$?
set -e
case "$GR" in
  0|1|123) : ;;
  *) echo "❌ 本地 CR 扫描出错(grep/xargs exit $GR)—— 无法归一,拒绝比对"; exit 2 ;;
esac
set +e
grep -vxF -f "$CUT_PATHS" "$LOCAL_PATHS" > "$PLAIN_PATHS" 2>/dev/null
GR2=$?
set -e
[ "$GR2" -le 1 ] || { echo "❌ 本地清单求差出错(grep exit $GR2)"; exit 2; }

declare -A MD5OF=()
if [ -s "$PLAIN_PATHS" ]; then
  # Git Bash 的 md5sum 可能输出 `<md5> *<路径>`(二进制模式)→ 一律去掉那个 *
  xargs -d '\n' -n 50 md5sum -- < "$PLAIN_PATHS" 2>/dev/null \
    | awk '{ p=$2; sub(/^\*/,"",p); print $1" "p }' > "$TMP/plain.md5"
  while read -r m p; do MD5OF["$p"]="$m"; done < "$TMP/plain.md5"
fi
if [ -s "$CUT_PATHS" ]; then
  while IFS= read -r p; do
    h=$(tr -d '\r' < "$p" | md5sum | cut -d' ' -f1)
    MD5OF["$p"]="$h"
  done < "$CUT_PATHS"
fi

: > "$LOCAL_MD5"
while IFS=$'\t' read -r lp rp; do
  if [ ! -f "$lp" ]; then
    echo "❌ 本地文件读不到:$lp"
    exit 2
  fi
  h="${MD5OF[$lp]:-}"
  if [ -z "$h" ]; then
    echo "❌ 本地摘要没算出来:$lp —— 状态未知,拒绝判定为一致"
    exit 2
  fi
  printf '%s %s\n' "$h" "$rp" >> "$LOCAL_MD5"
done < "$PAIRS"

# ---- 3) 远端摘要(一次 ssh,路径清单走 stdin) ----
# 这段脚本在服务器上用 sh 执行:逐行读相对路径,缺文件报 MISSING,否则同样剥 \r 再 md5sum。
# 引号层数要算准:本地双引号里写 '\\r' → 落到 ssh 参数字符串里是 '\r' → 远端单引号原样交给 tr
# → GNU tr 把 \r 认成回车。写成 '\\\\r' 的话远端收到的是 \\r,tr 会去删「反斜杠和字母 r」,
# 于是每个文件都假漂移(2026-10-12 沙箱实测到就是这个,171 个文件全报"不一致")。
REMOTE_CMD="cd $SRV || exit 9
while IFS= read -r f; do
  if [ ! -f \"\$f\" ]; then printf 'MISSING %s\n' \"\$f\"; continue; fi
  h=\$(tr -d '\\r' < \"\$f\" | md5sum | cut -d' ' -f1)
  printf '%s %s\n' \"\$h\" \"\$f\"
done"
REMOTE_MD5="$TMP/remote.md5"
# 这条 ssh 要往远端喂 stdin(清单),所以用 SSH,不能加 -n
if ! "${SSH[@]}" "$TARGET" "$REMOTE_CMD" < <(cut -f2 "$PAIRS") > "$REMOTE_MD5" 2>"$TMP/ssh.err"; then
  echo "❌ 远端比对命令执行失败(连不上?$SRV 不存在?主机密钥变了?)—— 无法判定漂移"
  [ -s "$TMP/ssh.err" ] && sed 's/^/    ssh: /' "$TMP/ssh.err"
  exit 2
fi
if [ ! -s "$REMOTE_MD5" ]; then
  echo "❌ 远端一条摘要都没返回($TOTAL 个文件全没读到)—— 无法判定漂移,不算通过"
  exit 2
fi

# ---- 4) 比对:只问"本地期望 vs 服务器实有",服务器上的多余文件不在本脚本职责内(deploy.sh 的差集清理管) ----
REPORT="$TMP/report.txt"
STATS=$(awk -v ol="$LOCAL_MD5" '
  NR==FNR { want[$2]=$1; order[++n]=$2; next }
  { got[$2]=$1 }
  END {
    ok=0; miss=0; diff=0;
    for (i=1;i<=n;i++) { p=order[i]
      if (!(p in got) || got[p]=="MISSING") { miss++; printf "  ✗ 服务器缺文件 %s\n", p }
      else if (got[p]!=want[p])  { diff++; printf "  ✗ 内容不一致   %s  本地 %s / 服务器 %s\n", p, substr(want[p],1,10), substr(got[p],1,10) }
      else ok++
    }
    printf "OK %d DRIFT %d MISSING %d TOTAL %d\n", ok, diff, miss, n
  }' "$LOCAL_MD5" "$REMOTE_MD5" | tee "$REPORT")
SUM=$(printf '%s\n' "$STATS" | tail -n1)
printf '%s\n' "$STATS" | grep -E '^  ✗' || true

# 顺手报一条"发布的是工作区还是 HEAD":漂移=0 但工作区脏,同样说明线上内容与某个 commit 对不上
# 必须 `|| true`:不在 git 仓库里跑(或 git 不可用)时,pipefail 会把这条赋值变成致命错误,
# 于是"比对其实已经通过"却被 set -e 打死 —— 假失败比假成功更气人。
if [ "$CHECK_BACKEND" = "1" ]; then
  DIRTY=$( { git status --porcelain -- server.js lib src/shared/mediarules.mjs 2>/dev/null || true; } | wc -l | tr -d ' ')
  [ "$DIRTY" = "0" ] || echo "ℹ️  后端有 $DIRTY 处未提交改动参与比对:服务器现在等于**工作区**,不等于某个 commit。要核对 commit 请先提交再发布。"
fi

if printf '%s\n' "$STATS" | grep -qE '^  ✗'; then
  echo ""
  # 前端半边有个陷阱,2026-10-12 实测踩到:本项目**构建不可复现** —— 同一棵工作树连续两次
  # `npm run build`,79 个 chunk 的文件名会全部变掉(vite/rolldown 的内容哈希里掺了每次构建都变的量)。
  # 于是"事后单独再跑一次本脚本"必然报一堆「服务器缺文件」,看起来像部署是半成品,实际只是
  # 本地 dist 已经不是当初上传的那一份。判据不在"本地 vs 服务器",而在"服务器自洽不自洽":
  #   线上 index.html 引用的每个资源都取得到 ⇒ 线上是自洽的一次构建,但**没法证明是我们要的那一次**
  #     ⇒ 结论是「无法比对」(exit 2),不是「有漂移」(exit 1),也不是「通过」(exit 0)
  #   线上 index.html 引用的资源取不到 ⇒ 真·半成品,照旧 exit 1
  # deploy.sh 第 8b 步不受影响:它比的就是刚上传的那一份 dist。
  SELF_OK=-1
  if [ "$CHECK_DIST" = "1" ]; then
    SRV_REFS=$("${SSHRO[@]}" "$TARGET" "cd $SRV && grep -oE '(assets/[A-Za-z0-9_.-]+\.(js|css)|[A-Za-z0-9_.-]+\.html|sw\.js|manifest\.json|data\.js)' index.html 2>/dev/null | sort -u" 2>/dev/null | tr -d '\r' || true)
    if [ -n "$SRV_REFS" ]; then
      # 这条要往远端喂 stdin(引用清单),所以必须用 SSH(不带 -n);SSHRO 的 -n 会把本地 stdin 换成 /dev/null
      ABSENT=$("${SSH[@]}" "$TARGET" "cd $SRV && while IFS= read -r r; do [ -f \"\$r\" ] || echo \"ABSENT \$r\"; done" <<<"$SRV_REFS" 2>/dev/null | tr -d '\r' || true)
      SELF_OK=1
      [ -n "$ABSENT" ] && SELF_OK=0
    fi
  fi
  if [ "$SELF_OK" = "1" ]; then
    echo "❌ 无法判定(不是「有漂移」):本地 dist 与线上不是同一份构建 —— 退出码 2。"
    echo "   依据:线上 index.html 引用的资源全部取得到(站点自洽),但本项目构建不可复现"
    echo "   (2026-10-12 实测:同一棵工作树连续两次 npm run build,79 个 chunk 名全变),"
    echo "   所以「逐字节 == 本地」这个判据在这里无效 —— 既不能说部署成功,也不能说部署坏了。"
    echo "   要真正核对:①只比后端 bash scripts/verify-drift.sh --backend-only ②或重发一次,"
    echo "   deploy.sh 第 8b 步比的就是它刚上传的那一份 dist:bash scripts/deploy.sh --yes"
    echo "DRIFT=unverifiable-different-build"
    exit 2
  fi
  echo "❌ 漂移复核未通过:$SUM"
  [ "$SELF_OK" = "0" ] && echo "   ⚠️ 且线上 index.html 引用的资源在服务器上取不到 ⇒ 站点不自洽,这是真·半成品"
  echo "   线上与本地要发的内容不一致 —— 本次发布**不能**当作完成。"
  echo "   后端补传:bash scripts/backend-sync.sh --yes      前端补传:bash scripts/deploy.sh --yes --no-models"
  echo "   再核对:  bash scripts/verify-drift.sh"
  exit 1
fi
echo "✅ 漂移复核通过:$SUM"
