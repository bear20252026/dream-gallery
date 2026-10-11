#!/usr/bin/env bash
# deploy.sh — 一键部署前后端到服务器(含验证 + 漂移复检)
# 用法: bash scripts/deploy.sh [--yes] [--no-models] [--no-backend] [--no-prune] [--no-drift] [--check] [--pin-hostkey] [--help]
# 顺序(2026-10-12 起,**后端先行**):构建 → 同步后端(server.js/lib,不重启)→ 上传并解压 dist → 单次重启
#                                 → 同步 models → 线上验证(读 HTTP 码)→ 漂移复检(逐文件比 md5)
# 为什么后端要在前端之前:前端假设新 API 端点已经存在。旧顺序(先传 dist 再同步后端)一旦后端同步被跳过,
#   线上就是"新前端 + 旧后端"——2026-10-11 真实踩到(后台缩略图当场回到 401 断图)。
#   现在后端同步失败/被拒/非交互没授权 ⇒ **立即中止,dist 一个字节都不传**,线上保持完整的旧版本(可回退、可诊断)。
# 注意:server.js 直接服务 /opt/gallery/assets/(不是 dist/assets/),必须解到根目录
#
# ⚠️ "部分成功"不再是成功(2026-10-12):
#   ① backend-sync.sh 的退出码是契约(0 一致/已上传并复核、1 出错、3 被拒、4 非交互没 --yes),
#      这里**按码分流**并中止,绝不写成 `|| echo`(旧版就是那句 `|| echo` 把失败洗成了继续)。
#   ② 每一步的结论写进 .tmp/deploy-state.env,release.sh 与人工都据此判断"到底发出去了什么"。
#   ③ 第 7 步验证读的是 curl 的 http_code **字段**,不是"脚本没报错"。
#   ④ 第 8 步逐文件比对本地与服务器(CRLF 两侧归一),漂移即非 0。
#
# ⚠️ 模型盲区(2026-09-23 根治):Vite 只复制 public/ 进 dist,models/ **不在 dist 里**;
#    但 server.js 直接服务 /opt/gallery/models/,代码按 /models/xxx.glb 绝对路径加载。
#    此前换模型必须手工 scp,忘一次线上就缺模型 → 本脚本第 6 步只补传"服务器没有的"文件。
#    ⚠️ 不用 rsync:Windows Git Bash 不带 rsync(实测 2026-09-23 `rsync: command not found`),
#    改用 md5 清单比对 + tar 打包上传,只用 ssh/scp/tar/find/md5sum 这些一定有的工具。
#    模型同步失败**不阻断验证**(中途死更糟),但会计入状态并在第 7/8 步之后让整体以非 0 退出。
#
# ⚠️ 凭据风险(2026-10-11 记录):兜底路径仍从桌面 markdown「梦幻画廊-交接笔记.md」抽取 SSH 私钥。
#    那台机器上把私钥以明文存在 markdown 里是已知风险 —— 迁移到 Windows OpenSSH Agent / 1Password /
#    GitHub Secrets 属主人本人的凭据管理动作,本脚本**不删**那台机器上的任何文件,只改读取优先级:
#    ①SSH_KEY(或 GIT_SSH_COMMAND 里的 -i) 环境变量 ②~/.ssh/gk-deploy.pem(2026-10-05 重建的耐久私钥)
#    ③桌面 markdown 兜底。三处都用同一把即可,别再造第二份临时私钥。
#
# ⚠️ SSH 主机信任(2026-10-11):改用 StrictHostKeyChecking=accept-new —— 首次信任、之后主机密钥变更即拒。
#    信任锚优先用仓库内 scripts/known_hosts(若存在);用 --pin-hostkey 生成后提交进仓库即可锁定。
#    登录用户默认仍是 root(SSH_USER 可 env 覆盖);切 deploy 用户属服务器侧动作,见 --help 与回报清单。
set -e -o pipefail
cd "$(dirname "$0")/.."
ROOT_DIR="$PWD"
HOST="${HOST:-101.133.235.110}"
SSH_USER="${SSH_USER:-root}"
# SRV 与 backend-sync.sh / verify-drift.sh 共用同一个旋钮:改一处即三处一致(默认 /opt/gallery)
SRV="${SRV:-/opt/gallery}"
# SSH_BIN/SCP_BIN:默认 ssh/scp;只有"绝不碰生产"的离线演练才覆盖(与 backend-sync.sh 同一套)
SSH_BIN="${SSH_BIN:-ssh}"
SCP_BIN="${SCP_BIN:-scp}"
HANDOVER_NOTE="${HANDOVER_NOTE:-C:/Users/17296/Desktop/梦幻画廊-交接笔记.md}"
KNOWN_HOSTS="${KNOWN_HOSTS:-$ROOT_DIR/scripts/known_hosts}"
SYNC_MODELS=1
SYNC_BACKEND=1
ALLOW_BACKEND_DRIFT=0
DEPLOY_PARTIAL=0   # 1 = 后端与服务器有差异且已被明确放行 ⇒ 结尾打 DEPLOY_PARTIAL 而不是 DEPLOY_OK
DO_PRUNE=1
DO_DRIFT=1         # 末尾逐文件比对本地 dist 与服务器(verify-drift.sh);--no-drift 才关
MODELS_BAD=0       # 1 = 模型同步出错(不阻断验证,但结尾不让它报 DEPLOY_OK)
KEY=""
KEY_OWNED=0        # 1 = 本脚本临时生成的私钥文件,退出时要删;0 = 主人耐久私钥,绝不删

# ---- 每一步的结论落盘(2026-10-12):"部署成功"必须是读得出来的字段,不是"脚本没报错" ----
# release.sh 与人工靠这份快照回答"到底发出去了什么":后端上去没、dist 上去没、重启了没、验证过没。
STATE_FILE="$ROOT_DIR/.tmp/deploy-state.env"
ST_BACKEND=not-run      # not-run|synced|verified|consistent-no-sync-needed|allowed-drift
ST_FRONTEND=not-run     # not-run=没碰服务器 | staged-tmp=包到了 /tmp 未解包 | extracted=已解包生效
ST_RESTART=not-run      # not-run|online|failed
ST_MODELS=not-run       # not-run|synced|skipped|failed
ST_VERIFY=not-run       # not-run|ok|failed
ST_DRIFT=not-run        # not-run|ok|failed|skipped
write_state() {
  mkdir -p "$ROOT_DIR/.tmp"
  {
    echo "# deploy.sh 状态快照(供 release.sh / 人工判断这次到底发出去了什么)"
    echo "TS=$(date -Iseconds 2>/dev/null || date)"
    echo "COMMIT=${COMMIT_SHORT:-unknown}"
    echo "BACKEND=$ST_BACKEND"
    echo "FRONTEND=$ST_FRONTEND"
    echo "RESTART=$ST_RESTART"
    echo "MODELS=$ST_MODELS"
    echo "VERIFY=$ST_VERIFY"
    echo "DRIFT=$ST_DRIFT"
  } > "$STATE_FILE"
}
# 任何一步栽在 set -e 上都要留下"到哪一步为止"的快照,否则失败即失忆
# 注意:EXIT trap 只有一个(后设的会覆盖先设的),所以私钥清理也必须走这里
on_exit() {
  rc=$?
  cleanup_key
  write_state
  if [ "$rc" != "0" ]; then
    echo ""
    echo "=== deploy.sh 以 exit $rc 结束。已发出的部分(见 $STATE_FILE) ==="
    echo "   BACKEND=$ST_BACKEND FRONTEND=$ST_FRONTEND RESTART=$ST_RESTART MODELS=$ST_MODELS VERIFY=$ST_VERIFY DRIFT=$ST_DRIFT"
    if [ "$ST_FRONTEND" = "not-run" ]; then
      echo "   前端 dist【未】上传 ⇒ 线上仍是完整的旧版本,没有新前端打旧接口的窗口。"
    elif [ "$ST_FRONTEND" = "staged-tmp" ]; then
      echo "   前端包只到了服务器 /tmp、【未】解包 ⇒ 线上前端仍是旧版本(后端可能已是新的)。"
      echo "   要收尾:在服务器上 tar -xzf /tmp/dist.tar.gz(先 ls /tmp 确认还在),或直接重跑 bash scripts/deploy.sh --no-backend"
    else
      echo "   前端 dist【已】解包生效 ⇒ 线上已是新前端。若 RESTART/VERIFY/DRIFT 里有 not-run 或 failed,现在就是半成品,按上面各步提示收口。"
    fi
    echo "DEPLOY_FAILED exit=$rc"
  fi
  return $rc
}

pick_key() {
  # ①环境变量显式指定优先
  if [ -n "${SSH_KEY:-}" ] && [ -f "$SSH_KEY" ]; then KEY="$SSH_KEY"; return 0; fi
  if [ -n "${GIT_SSH_COMMAND:-}" ]; then
    k=$(printf '%s' "$GIT_SSH_COMMAND" | awk '{for(i=1;i<NF;i++) if($i=="-i"){print $(i+1); exit}}' | tr -d "\"'")
    if [ -n "$k" ] && [ -f "$k" ]; then KEY="$k"; return 0; fi
  fi
  # ②耐久部署私钥
  if [ -f "$HOME/.ssh/gk-deploy.pem" ]; then KEY="$HOME/.ssh/gk-deploy.pem"; return 0; fi
  # ③桌面交接笔记兜底(临时文件,退出删)
  if [ ! -f "$HANDOVER_NOTE" ]; then
    echo "❌ 找不到可用私钥:SSH_KEY 未设、~/.ssh/gk-deploy.pem 不存在、交接笔记也不在($HANDOVER_NOTE)"
    echo "   请用 --help 查看凭据优先级说明,或设 SSH_KEY=<私钥路径> 再跑。"
    exit 1
  fi
  KEY="/tmp/gk.pem"; KEY_OWNED=1
  awk '/BEGIN/{f=1} f{print} /END/{if(f)exit}' "$HANDOVER_NOTE" | tr -d '\r' > "$KEY"
  chmod 600 "$KEY"
}

# 组装 ssh/scp 参数数组(数组防空格)
# SSH_BIN/SCP_BIN 与 backend-sync.sh 同一套注入口:默认 ssh/scp,只为"不碰生产"的演练/自测覆盖
# (2026-10-12:deploy.sh 原先硬编码 ssh,导致无法离线演练新加的"后端失败即中止"这条路径)
build_ssh_args() {
  SSH_ARR=("${SSH_BIN:-ssh}" -i "$KEY" -o StrictHostKeyChecking=accept-new)
  SCP_ARR=("${SCP_BIN:-scp}" -i "$KEY" -o StrictHostKeyChecking=accept-new)
  if [ -f "$KNOWN_HOSTS" ]; then
    SSH_ARR+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
    SCP_ARR+=(-o "UserKnownHostsFile=$KNOWN_HOSTS")
  else
    # 没有 scripts/known_hosts 时 accept-new 会写进默认 known_hosts;提示一下但不阻断
    echo "ℹ️  未找到 $KNOWN_HOSTS(用 --pin-hostkey 生成并入库可锁定主机密钥),本次走系统默认信任。"
  fi
  TARGET="$SSH_USER@$HOST"
}

cleanup_key() { [ "$KEY_OWNED" = "1" ] && rm -f "$KEY"; return 0; }

# ---- 参数解析 ----
DO_PIN=0
HELP=0
YES=0
for a in "$@"; do
  case "$a" in
    --no-models) SYNC_MODELS=0 ;;
    --no-backend) SYNC_BACKEND=0 ;;
    --allow-backend-drift) ALLOW_BACKEND_DRIFT=1 ;;
    --no-prune) DO_PRUNE=0 ;;
    --yes|-y) YES=1 ;;
    --check) DO_DRIFT=1 ;;
    --no-drift) DO_DRIFT=0 ;;
    --pin-hostkey) DO_PIN=1 ;;
    -h|--help) HELP=1 ;;
  esac
done

if [ "$HELP" = "1" ]; then
  cat <<'HELP'
bash scripts/deploy.sh [--yes] [--no-models] [--no-backend] [--no-prune] [--pin-hostkey]

  --yes          非交互授权后端同步(把 --yes 透传给 scripts/backend-sync.sh)。
                 不加它又不在终端里跑 ⇒ 后端同步硬失败(exit 4),部署在上传前端【之前】就中止。
  --no-models    跳过模型增量同步(失败只警告:模型是持久资产,漏传只影响新模型)
  --no-backend   跳过后端(server.js/lib)**上传**,但仍校验:若真有差异即 exit 6 中止。
                 确认要带着差异上线(后端在别人手里改/紧急只改前端)再加 --allow-backend-drift。
  --allow-backend-drift  与 --no-backend 配套:把"后端有差异"降级为警告继续部署(会在输出里点名)
  --no-prune     差集清理只列清单不删除(默认会删残留旧 assets 与已下线入口 html)
  --check        结尾强制逐文件漂移复检(默认已开,这个开关只是让"要证据"这件事显式化)
  --no-drift     跳过 scripts/verify-drift.sh(默认不开)。等于主动放弃
                 "服务器上的文件真等于我这次发的文件"这条唯一能证伪"部分部署"的证据,会在输出里打 ::AUDIT::。
  --pin-hostkey  本地跑 ssh-keyscan 把服务器主机密钥落盘到 scripts/known_hosts + 打印指纹请主人核对
                 (会联网,仅生成信任锚,不部署任何东西,运行后自行退出)

凭据优先级:SSH_KEY/GIT_SSH_COMMAND 环境变量 → ~/.ssh/gk-deploy.pem → 桌面交接笔记(兜底,临时文件)
环境变量:HOST / SSH_USER(默认 root) / HANDOVER_NOTE / KNOWN_HOSTS / SSH_KEY 皆可覆盖
HELP
  exit 0
fi

# ---- --pin-hostkey 独立流程(联网,只做信任锚,不部署) ----
if [ "$DO_PIN" = "1" ]; then
  echo "=== pin-hostkey: 抓取 $HOST 的 SSH 主机密钥 ==="
  TMPKH="$KNOWN_HOSTS.new"
  if ! command -v ssh-keyscan >/dev/null 2>&1; then
    echo "❌ 本机没有 ssh-keyscan,无法生成信任锚。"; exit 1
  fi
  ssh-keyscan -t ed25519,rsa "$HOST" > "$TMPKH" 2>/dev/null || { rm -f "$TMPKH"; echo "❌ ssh-keyscan 失败(网络?被防火墙挡?)"; exit 1; }
  if [ ! -s "$TMPKH" ]; then rm -f "$TMPKH"; echo "❌ ssh-keyscan 没抓到任何主机密钥"; exit 1; fi
  echo "--- 抓到的主机密钥指纹(请与可信渠道核对,例如阿里云控制台/已有的线下记录) ---"
  if command -v ssh-keygen >/dev/null 2>&1; then
    ssh-keygen -lf "$TMPKH" | tee "$ROOT_DIR/scripts/hostkey-fingerprint.txt"
  else
    echo "(本机没有 ssh-keygen,只落原始密钥,请自行核对)"; cat "$TMPKH"
  fi
  echo ""
  echo "确认指纹无误后:mv \"$TMPKH\" \"$KNOWN_HOSTS\"  并把 scripts/known_hosts 提交进仓库即可长期锁定。"
  echo "在确认之前,部署照旧用 accept-new(首次信任)。"
  exit 0
fi

pick_key
build_ssh_args
trap on_exit EXIT   # 单一 EXIT trap:删本脚本临时抽取的兜底私钥 + 落状态快照 + 失败时点名发到哪一步

echo "=== 版本戳(仅本地 echo,便于线上核对;真正的线上校验姿势见 AGENTS:取 index.html 实际引用的 chunk 去 grep 哈希) ==="
COMMIT_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "本次部署 commit: ${COMMIT_SHORT}   CI run: ${CI_RUN_ID:-<未提供,本地直接部署>}"

echo "=== 1/8 构建 ==="
rm -rf dist node_modules/.vite
# 不能写成 `npm run build 2>&1 | tail -3`:`-o pipefail` 在 `set -e` 下把**整条管道**的状态当作
# 本条语句的状态,构建成功与否都被 tail 的退出码覆盖(真失败时报错还被摘掉)。落盘后再摘错误行。
BUILD_LOG=.tmp/deploy-build.log
mkdir -p .tmp
BUILD_RC=0
npm run build > "$BUILD_LOG" 2>&1 || BUILD_RC=$?
if [ "$BUILD_RC" != "0" ]; then
  echo "❌ 构建失败(exit $BUILD_RC),已停止:什么都没往服务器发(完整输出见 $BUILD_LOG)"
  grep -E 'error|Error|ERROR' "$BUILD_LOG" | tail -20 || true
  exit 1
fi
tail -3 "$BUILD_LOG"

echo "=== 2/8 密钥已就绪(${KEY}) ==="

echo "=== 3/8 同步后端文件(server.js / lib)——先于前端上传 ==="
# 2026-10-05:后端不进 dist,以前靠手工 scp(盲区①)。现在比对 md5,列出差异,问 y/N 后备份+上传+复核。
# 2026-10-12 顺序调整(修"新前端 + 旧后端"事故):后端先上,前端后上。
#   新后端对旧前端保持兼容(加接口/收紧权限,旧页面照常跑);反过来先上前端,新页面就会打到没有
#   新接口的后端上。中途失败的方向因此从"线上坏版本"变成"线上旧版本 + 新后端",可接受。
# 失败/拒绝**一律中止部署**(旧版是 `|| echo` 吞掉,于是 dist 照样上线、脚本自称成功):
#   退出码 1=上传或复核出错 3=操作者答 N 4=非交互未授权(见 backend-sync.sh 头部的契约)
# 调 backend-sync.sh 的统一入口:把本机已解析好的凭据/主机/SSH 注入口一路带过去
# (不带 SSH_BIN/SCP_BIN 的话,离线演练时 deploy.sh 用假 ssh、backend-sync 用真 ssh —— 测了个假的)
run_backend_sync() {
  KEY="$KEY" KEY_OWNED=0 HOST="$HOST" SSH_USER="$SSH_USER" SRV="$SRV" \
  KNOWN_HOSTS="$KNOWN_HOSTS" SSH_BIN="$SSH_BIN" SCP_BIN="$SCP_BIN" \
    bash scripts/backend-sync.sh "$@"
}
if [ "$SYNC_BACKEND" = "1" ]; then
  BS_ARGS=""
  [ "$YES" = "1" ] && BS_ARGS="--yes"
  rc=0
  BACKEND_SYNC_NO_RESTART=1 run_backend_sync $BS_ARGS || rc=$?
  if [ "$rc" != "0" ]; then
    echo ""
    echo "=== ❌ 部署已中止:后端【未】同步(exit $rc)。dist 一个字节都没上传,线上仍是完整旧版本。 ==="
    echo "   不存在「半成功」:线上前端与后端仍是同一批代码,没有新前端打旧接口的窗口。"
    echo "   按退出码处置:1=看上面的上传/md5 报错;3=重新运行并在提示处回答 y;4=加 --yes(整套发布:bash scripts/release.sh --yes)"
    echo "   想确认本次是否真的只改了前端: bash scripts/backend-sync.sh --dry"
    exit "$rc"
  fi
  echo "✅ 后端已同步(md5 复核通过),继续前端上传"
  ST_BACKEND=synced; write_state
else
  # --no-backend 只豁免"上传",不豁免"校验":跳过上传却真有后端差异,正是这次事故的形状。
  rc=0; run_backend_sync --check || rc=$?
  if [ "$rc" = "5" ] && [ "$ALLOW_BACKEND_DRIFT" != "1" ]; then
    echo "=== ❌ 已用 --no-backend,但服务器上的后端与本地确实不同 —— 继续就是「新前端 + 旧后端」。 ==="
    echo "   要同步后端:去掉 --no-backend 重跑(或 bash scripts/backend-sync.sh --yes)"
    echo "   确认就要带着差异上线(例如后端正在别人手里改):加 --allow-backend-drift"
    exit 6
  elif [ "$rc" = "5" ]; then
    echo "⚠️ --no-backend + --allow-backend-drift:明知后端有差异仍继续,线上=「新前端 + 旧后端」(已记入本次输出)"
    DEPLOY_PARTIAL=1
    ST_BACKEND=allowed-drift
  elif [ "$rc" != "0" ]; then
    echo "=== ❌ 后端状态无法确认(exit $rc),又用 --no-backend 跳过了同步 —— 中止,不把结论交给猜测。 ==="
    echo "   多半是本机没有可用私钥或连不上服务器:先跑 bash scripts/backend-sync.sh --dry 看清楚"
    exit 1
  else
    echo "✅ --no-backend:后端与服务器本来就一致,无需同步"
    ST_BACKEND=consistent-no-sync-needed
  fi
fi

echo "=== 4/8 打包并上传 ==="
# 从这里开始才是"会改变线上状态"的部分。第 3 步已把后端同步好(且 md5 复核过),
# 所以本步/下一步一旦失败,线上状态是「新后端 + 旧前端」——旧前端跑在新后端上是安全的
# (后端只加接口/收紧权限),但必须点名说清,别让它看起来像"部署成功"。
tar -czf /tmp/dist.tar.gz -C dist .
"${SCP_ARR[@]}" /tmp/dist.tar.gz "$TARGET:/tmp/" || {
  echo "❌ dist 上传失败:线上=【新后端 + 旧前端】(旧前端在新后端上可正常跑)。"
  echo "   排查网络/磁盘后单独重跑部署:bash scripts/deploy.sh --no-backend(后端已在位)"
  exit 1
}
ST_FRONTEND=staged-tmp   # 包已在服务器 /tmp,还没解包对外生效

echo "=== 5/8 解压到服务目录 + 差集清理残留 ==="
# 把本次 dist 的清单当作权威真相:凡服务器上有、本次清单里没有的旧文件都算残留。
# 血泪:此前只削 main-*.js,从不删除已不存在的旧哈希块(如历史 entrygate-*.js)与已下线入口 html,
# 残留还可能被 Cloudflare 边缘继续服务。这里按 tar 清单做差集清理。
# 保留最新 3 个 main-*.js 作安全垫(旧 HTML 可能被 CF 边缘缓存后再请求旧 chunk → 留 3 个防 404)。
PRUNE_RC=0
"${SSH_ARR[@]}" "$TARGET" bash -s -- "$DO_PRUNE" <<'EOF' || PRUNE_RC=$?
cd /opt/gallery
SUF=$$
ALL=/tmp/_rel_all.$SUF
RA=/tmp/_rel_assets.$SUF
RH=/tmp/_rel_roothtml.$SUF
tar -tzf /tmp/dist.tar.gz | sed 's#^\./##' > "$ALL"
grep '^assets/' "$ALL" | sed 's#^assets/##' | sort > "$RA"
grep -v '/' "$ALL" | grep '\.html$' | sort > "$RH"
# 先落新分包,再切换 HTML 入口(沿用旧顺序,避免入口短暂引用尚未解包的哈希资源)
tar -xzf /tmp/dist.tar.gz ./assets
tar -xzf /tmp/dist.tar.gz
rm -f /tmp/dist.tar.gz
# 安全垫:main-*.js 按 mtime 最新 3 个
ls -t assets/main-*.js 2>/dev/null | head -n 3 | xargs -n1 basename 2>/dev/null | sort > /tmp/_keepmain.$SUF || true
# assets 差集:在服务器上但不在本次清单里的
ls -1 assets 2>/dev/null | sort > /tmp/_srv_assets.$SUF
comm -23 /tmp/_srv_assets.$SUF "$RA" > /tmp/_assets_cand.$SUF
# 从候选里扣掉"最新 3 个 main 安全垫"(keepmain 为空则一条都不扣;|| true 防 grep 无输出时误退回整份候选)
grep -vxF -f /tmp/_keepmain.$SUF /tmp/_assets_cand.$SUF > /tmp/_assets_del.$SUF || true
# 根级 html 差集:只在"已知 Vite 入口清单"内的才敢删(与后端 lib/security.js 的 ROOT_PUBLIC_FILES 登记表同源,防漂移)
# ⚠️ 改本清单同时改 lib/security.js;拿不准的(如 official.html 镜像、任何手动 html)一律不删,只 WARN。
ls -1 /opt/gallery/*.html 2>/dev/null | xargs -n1 basename 2>/dev/null | sort > /tmp/_srv_roothtml.$SUF || true
comm -23 /tmp/_srv_roothtml.$SUF "$RH" > /tmp/_rootdiff.$SUF
printf '%s\n' index.html admin.html guide.html whiteboard.html music.html agreement.html privacy.html community.html lobby.html room.html | sort > /tmp/_expected_root.$SUF
comm -12 /tmp/_rootdiff.$SUF /tmp/_expected_root.$SUF > /tmp/_root_del.$SUF
comm -23 /tmp/_rootdiff.$SUF /tmp/_expected_root.$SUF > /tmp/_root_warn.$SUF
if [ "$1" = "1" ]; then
  echo "--- 将删除的残留 assets/ ---"; cat /tmp/_assets_del.$SUF
  if [ -s /tmp/_assets_del.$SUF ]; then ( cd assets && xargs -r -a /tmp/_assets_del.$SUF rm -f ); fi
  echo "--- 将删除的残留根级 html ---"; cat /tmp/_root_del.$SUF
  if [ -s /tmp/_root_del.$SUF ]; then xargs -r -a /tmp/_root_del.$SUF -I{} rm -f "/opt/gallery/{}"; fi
else
  echo "(--no-prune:以下残留只列出,未删除)"
  echo "残留 assets/:"; cat /tmp/_assets_del.$SUF
  echo "残留根级 html:"; cat /tmp/_root_del.$SUF
fi
if [ -s /tmp/_root_warn.$SUF ]; then
  echo "::WARN:: 这些根级 html 不在本次 dist、也不在受控入口清单,未删除,请主人决定:"; cat /tmp/_root_warn.$SUF
fi
echo "清理后 main chunk 数: $(ls assets/main-*.js 2>/dev/null | wc -l)"
# ⚠️ models/ photos/ videos/ music/ gate_data* .env 永不在清理范围(数据与凭据是手动范围,AGENTS 明文)
rm -f "$ALL" "$RA" "$RH" /tmp/_keepmain.$SUF /tmp/_srv_assets.$SUF /tmp/_assets_cand.$SUF /tmp/_assets_del.$SUF /tmp/_srv_roothtml.$SUF /tmp/_rootdiff.$SUF /tmp/_expected_root.$SUF /tmp/_root_del.$SUF /tmp/_root_warn.$SUF
EOF
if [ "$PRUNE_RC" != "0" ]; then
  echo "❌ 远端解压/清理失败(exit $PRUNE_RC):线上=【新后端 + 旧前端】(dist.tar.gz 可能还留在 /tmp 未解包)。"
  echo "   旧前端跑在新后端上是安全的,但这次发布没有完成:排查后重跑 bash scripts/deploy.sh --no-backend"
  echo "   要人工处置:在服务器上 tar -xzf /tmp/dist.tar.gz(先 ls /tmp 确认还在)"
  exit 1
fi
ST_FRONTEND=extracted

echo "=== 6/8 重启服务 + 后端漂移复检 ==="
# kill-timeout 25000:后端 SHUTDOWN_DRAIN_MS 现为 15000ms,9000 会在优雅排空途中 SIGKILL → 必须 > 排空时长。
# 判成败读的是远端 grep 的结果(远端管道,本地 pipefail 管不到它,所以 ssh 的退出码就是远端命令的退出码);
# 没有 "gallery … online" 这一行 = 服务状态未知,必须当成失败,不能继续往下报"部署完成"。
rc=0
"${SSH_ARR[@]}" "$TARGET" "pm2 restart gallery --update-env --kill-timeout 25000 >/dev/null && sleep 2 && pm2 status gallery | grep -E 'gallery.*online'" || rc=$?
if [ "$rc" != "0" ]; then
  echo "=== ❌ 部署未完成:重启后 pm2 status 里没有 'gallery … online'(exit $rc)。 ==="
  echo "   前端已解包、后端已上传,但进程状态未确认 ⇒ 立刻人工检查:ssh $TARGET 'pm2 logs gallery --lines 50'"
  echo "   代码已上传但没生效、和进程起不来,是两回事 —— 这一条绝不能算作部署成功。"
  exit 1
fi
ST_RESTART=online
# 复检:第 3 步之后只要有任何后端文件与服务器不同(包括"只上传了一半"),这里就非 0 —— 部署不得自称成功。
# 例外:操作者在第 3 步已用 --no-backend + --allow-backend-drift 明确认下这个差异,这里只报不拦
#       (否则那两个开关等于"永远无法完成部署")。
rc=0; run_backend_sync --check || rc=$?
if [ "$rc" = "0" ]; then
  echo "✅ 后端与服务器一致(复检通过)"
  ST_BACKEND=verified
elif [ "$rc" = "5" ] && [ "$SYNC_BACKEND" = "0" ] && [ "$ALLOW_BACKEND_DRIFT" = "1" ]; then
  echo "::WARN:: 后端仍有差异 —— 这是第 3 步里你已明确放行的状态,本次线上=「新前端 + 旧后端」。"
  echo "   别忘了收口:bash scripts/backend-sync.sh --yes"
  DEPLOY_PARTIAL=1
else
  echo "=== ❌ 部署未完成:后端与服务器仍有差异(exit $rc)。线上前后端不同源,请立即处置 ==="
  echo "   查看名单:bash scripts/backend-sync.sh --dry    补齐:bash scripts/backend-sync.sh --yes"
  exit "$rc"
fi

echo "=== 7/8 同步 models/(只补服务器缺的) ==="
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
  "${SSH_ARR[@]}" "$TARGET" \
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
      "${SCP_ARR[@]}" /tmp/models_patch.tar.gz "$TARGET:/tmp/"
      "${SSH_ARR[@]}" "$TARGET" \
        "cd /opt/gallery/models && tar -xzf /tmp/models_patch.tar.gz && rm -f /tmp/models_patch.tar.gz && echo '已解包'"
      echo "✅ 已补传 $DIFF_N 个模型文件"
    else
      echo "⚠️ 打包失败,请手工检查 models/"
    fi
  fi
  }
  # 失败不阻断后面的验证(2026-09-23 的教训:set -e 曾因 rsync 缺失死在半路,连验证都没跑成),
  # 但**必须计入状态**并在最后让整体非 0 —— "验证跑了、没报错"不等于"模型也齐了"。
  ST_MODELS=unknown
  _sync_models && ST_MODELS=synced || { echo "⚠️ 模型同步环节出错(不影响 dist 已上线),请手工核对 models/"; ST_MODELS=failed; MODELS_BAD=1; }
  rm -f /tmp/models_local.md5 /tmp/models_srv.md5 /tmp/models_diff.md5 /tmp/models_diff.list /tmp/models_patch.tar.gz
else
  echo "(已用 --no-models 跳过)"
  ST_MODELS=skipped
fi

echo "=== 8/8 验证线上(读 http_code / healthz 的字段,不看「脚本没报错」) ==="
# 这一步过去只是把 HTTP 状态**打印**出来,然后无条件写"部署完成"——
# 打印不等于检查:200 之外的一切(含 000=连不上)都必须让部署以非 0 收场。
BASE_URL="${BASE_URL:-https://cloudbear.cloud}"
VERIFY_FAIL=0
HOME_CODE=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE_URL/" || echo 000)
echo "首页 HTTP:$HOME_CODE  ($BASE_URL/)"
if [ "$HOME_CODE" != "200" ]; then
  echo "❌ 首页没拿到 200(exit-code 字段=$HOME_CODE)—— 不把这一条算作部署完成"
  VERIFY_FAIL=1
fi
# /healthz 是后端进程自己回的结构化结论(见 lib/routes.js),比"首页是静态文件所以照样 200"有说服力
HEALTHZ=$(curl -s -L "$BASE_URL/healthz" || echo '')
echo "健康检查 /healthz:${HEALTHZ:-<空响应>}"
case "$HEALTHZ" in
  *'"ok":true'*|*'"ok": true'*) : ;;
  *) echo "❌ /healthz 没回 ok:true(后端可能没起来 / 路由没上线)"; VERIFY_FAIL=1 ;;
esac
echo "--- 线上首页引用的 chunk ---"
ONLINE_CHUNKS=$(curl -s -L "$BASE_URL/" | grep -oE 'main-[A-Za-z0-9_-]+\.js' | sort -u)
printf '%s\n' "$ONLINE_CHUNKS"
echo "--- 本地 dist 的 chunk ---"
LOCAL_CHUNKS=$(for f in dist/assets/main-*.js; do basename "$f"; done | sort)
printf '%s\n' "$LOCAL_CHUNKS"
echo "--- 各 chunk HTTP 状态 ---"
if [ -z "$ONLINE_CHUNKS" ]; then
  echo "❌ 线上首页里没抓到 main-*.js(页面没发出来?选择器变了?)"
  VERIFY_FAIL=1
fi
for f in $ONLINE_CHUNKS; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE_URL/assets/$f" || echo 000)
  echo "$f -> $code"
  [ "$code" = "200" ] || VERIFY_FAIL=1
done
# 本地刚构建的 chunk 至少要有一个出现在线上首页引用里,否则"部署完成"讲的不是这一版
if [ -n "$ONLINE_CHUNKS" ] && [ -n "$LOCAL_CHUNKS" ]; then
  if ! comm -12 <(printf '%s\n' "$LOCAL_CHUNKS") <(printf '%s\n' "$ONLINE_CHUNKS") | grep -q .; then
    echo "❌ 线上首页引用的 chunk 一个都不是本次构建的 ⇒ 新前端还没生效"
    echo "   多半是 Cloudflare 边缘还在发缓存的旧 HTML(后台 Purge Everything 或等它过期),"
    echo "   也可能是解包没落到位。别把这次的输出当成「已经上线了」。"
    VERIFY_FAIL=1
  fi
fi
if [ "$VERIFY_FAIL" = "0" ]; then
  ST_VERIFY=ok
else
  ST_VERIFY=failed
fi
write_state

echo "=== 8b 漂移复检(逐文件比本地与服务器;CRLF 两侧归一) ==="
# verify-drift.sh 是唯一能否决"部署完成"的逐文件证据:上面验的是"站点活着且指向新 chunk",
# 这里验的是"服务器上这些字节 == 我这次发出去的字节"。缺文件/内容不一致/连不上都非 0。
if [ "$DO_DRIFT" = "1" ]; then
  rc=0
  KEY="$KEY" HOST="$HOST" SSH_USER="$SSH_USER" SRV="$SRV" \
  KNOWN_HOSTS="$KNOWN_HOSTS" SSH_BIN="$SSH_BIN" SCP_BIN="$SCP_BIN" \
    bash scripts/verify-drift.sh || rc=$?
  if [ "$rc" = "0" ]; then
    ST_DRIFT=ok
  elif [ "$rc" = "1" ]; then
    ST_DRIFT=drift
    echo "❌ 漂移复检发现线上与本次要发的内容不一致 —— 部署是半成品(见上表名单)"
  else
    ST_DRIFT=unverifiable
    echo "❌ 漂移复检没跑成(exit $rc:连不上 / 清单为空 / 本地缺 dist)—— 状态未知不等于一致"
  fi
else
  ST_DRIFT=skipped
  echo "::AUDIT:: 已用 --no-drift 跳过漂移复检:本次没有「服务器字节 == 本地字节」的证据。"
  echo "   随时补一次(只读):bash scripts/verify-drift.sh"
fi
write_state

echo ""
echo "=== 部署收尾(commit ${COMMIT_SHORT} / CI run ${CI_RUN_ID:-无}) ==="
echo "   状态快照:$STATE_FILE"
if [ "$DEPLOY_PARTIAL" = "1" ]; then
  echo "⚠️ 部分部署:前端已更新、后端按你的放行保持旧版。收口:bash scripts/backend-sync.sh --yes"
  echo "DEPLOY_PARTIAL $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  exit 1
elif [ "$VERIFY_FAIL" != "0" ]; then
  echo "❌ 线上验证未通过(http_code / healthz / chunk 三项里有不合格的)—— 不是「部署成功」"
  echo "DEPLOY_FAILED verify"
  exit 1
elif [ "$ST_DRIFT" != "ok" ] && [ "$ST_DRIFT" != "skipped" ]; then
  echo "❌ 漂移复检未通过($ST_DRIFT)—— 不是「部署成功」"
  echo "DEPLOY_FAILED drift"
  exit 1
elif [ "$MODELS_BAD" = "1" ]; then
  echo "⚠️ 前后端已一致上线,但模型同步出错:线上可能缺新模型。手工核对 models/ 后重跑 bash scripts/deploy.sh --no-backend"
  echo "DEPLOY_PARTIAL models"
  exit 1
else
  echo "后端在第 3 步上传并 md5 复核、第 6 步 --check 复检通过;前端逐文件漂移一致;线上 http_code/healthz/chunk 三项齐 ⇒ 前后端同源。"
  echo "DEPLOY_OK $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
fi
