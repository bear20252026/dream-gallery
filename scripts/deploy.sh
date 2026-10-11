#!/usr/bin/env bash
# deploy.sh — 一键部署前端到服务器(含验证)
# 用法: bash scripts/deploy.sh [--no-models] [--no-backend] [--no-prune] [--pin-hostkey] [--help]
# 功能: build → 上传完整 dist → 解到 /opt/gallery/ 根目录 → 差集清理旧文件 → 同步后端(问 y/N)→ 重启 → 同步 models → 验证
# 注意:server.js 直接服务 /opt/gallery/assets/(不是 dist/assets/),必须解到根目录
#
# ⚠️ 模型盲区(2026-09-23 根治):Vite 只复制 public/ 进 dist,models/ **不在 dist 里**;
#    但 server.js 直接服务 /opt/gallery/models/,代码按 /models/xxx.glb 绝对路径加载。
#    此前换模型必须手工 scp,忘一次线上就缺模型 → 本脚本第 6 步只补传"服务器没有的"文件。
#    ⚠️ 不用 rsync:Windows Git Bash 不带 rsync(实测 2026-09-23 `rsync: command not found`),
#    改用 md5 清单比对 + tar 打包上传,只用 ssh/scp/tar/find/md5sum 这些一定有的工具。
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
HANDOVER_NOTE="${HANDOVER_NOTE:-C:/Users/17296/Desktop/梦幻画廊-交接笔记.md}"
KNOWN_HOSTS="${KNOWN_HOSTS:-$ROOT_DIR/scripts/known_hosts}"
SYNC_MODELS=1
SYNC_BACKEND=1
DO_PRUNE=1
KEY=""
KEY_OWNED=0        # 1 = 本脚本临时生成的私钥文件,退出时要删;0 = 主人耐久私钥,绝不删

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

# 组装 ssh/scp 参数数组(数组避免引号/空格踩坑)
build_ssh_args() {
  SSH_ARR=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new)
  SCP_ARR=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)
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
for a in "$@"; do
  case "$a" in
    --no-models) SYNC_MODELS=0 ;;
    --no-backend) SYNC_BACKEND=0 ;;
    --no-prune) DO_PRUNE=0 ;;
    --pin-hostkey) DO_PIN=1 ;;
    -h|--help) HELP=1 ;;
  esac
done

if [ "$HELP" = "1" ]; then
  cat <<'HELP'
bash scripts/deploy.sh [--no-models] [--no-backend] [--no-prune] [--pin-hostkey]

  --no-models    跳过第 6 步 models 增量同步
  --no-backend   跳过第 5 步后端(server.js/lib)同步(仍会重启)
  --no-prune     差集清理只列清单不删除(默认会删残留旧 assets 与已下线入口 html)
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
trap cleanup_key EXIT   # 只删本脚本临时抽取的兜底私钥;耐久私钥(KEY_OWNED=0)绝不删

echo "=== 版本戳(仅本地 echo,便于线上核对;真正的线上校验姿势见 AGENTS:取 index.html 实际引用的 chunk 去 grep 哈希) ==="
COMMIT_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "本次部署 commit: ${COMMIT_SHORT}   CI run: ${CI_RUN_ID:-<未提供,本地直接部署>}"

echo "=== 1/7 构建 ==="
rm -rf dist node_modules/.vite
npm run build 2>&1 | tail -3

echo "=== 2/7 密钥已就绪(${KEY}) ==="

echo "=== 3/7 打包并上传 ==="
tar -czf /tmp/dist.tar.gz -C dist .
"${SCP_ARR[@]}" /tmp/dist.tar.gz "$TARGET:/tmp/"

echo "=== 4/7 解压到服务目录 + 差集清理残留 ==="
# 把本次 dist 的清单当作权威真相:凡服务器上有、本次清单里没有的旧文件都算残留。
# 血泪:此前只削 main-*.js,从不删除已不存在的旧哈希块(如历史 entrygate-*.js)与已下线入口 html,
# 残留还可能被 Cloudflare 边缘继续服务。这里按 tar 清单做差集清理。
# 保留最新 3 个 main-*.js 作安全垫(旧 HTML 可能被 CF 边缘缓存后再请求旧 chunk → 留 3 个防 404)。
"${SSH_ARR[@]}" "$TARGET" bash -s -- "$DO_PRUNE" <<'EOF'
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

echo "=== 5/7 同步后端文件(server.js / lib)+ 重启服务 ==="
# 2026-10-05:后端不进 dist,以前靠手工 scp(盲区①)。现在比对 md5,列出差异,问 y/N 后备份+上传+复核。
# 失败或拒绝都不阻断部署;重启统一在下面做一次。
# kill-timeout 25000:后端 SHUTDOWN_DRAIN_MS 现为 15000ms,9000 会在优雅排空途中 SIGKILL → 必须 > 排空时长。
if [ "$SYNC_BACKEND" = "1" ]; then
  KEY="$KEY" KEY_OWNED=0 HOST="$HOST" SSH_USER="$SSH_USER" KNOWN_HOSTS="$KNOWN_HOSTS" BACKEND_SYNC_NO_RESTART=1 \
    bash scripts/backend-sync.sh \
    || echo "⚠️ 后端同步出错(dist 已上线),请单独运行 bash scripts/backend-sync.sh --dry 查看"
else
  echo "(已用 --no-backend 跳过后端同步)"
fi
"${SSH_ARR[@]}" "$TARGET" "pm2 restart gallery --update-env --kill-timeout 25000 >/dev/null && sleep 2 && pm2 status gallery | grep -E 'gallery.*online'"

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
  _sync_models || echo "⚠️ 模型同步环节出错(不影响 dist 已上线),请手工核对 models/"
  rm -f /tmp/models_local.md5 /tmp/models_srv.md5 /tmp/models_diff.md5 /tmp/models_diff.list /tmp/models_patch.tar.gz
else
  echo "(已用 --no-models 跳过)"
fi

echo "=== 7/7 验证线上 ==="
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
echo "=== 部署完成(commit ${COMMIT_SHORT} / CI run ${CI_RUN_ID:-无}) ==="
echo "如果上方 HTTP 状态全为 200 且本地/线上 chunk 列表一致,说明同步正确"

cleanup_key
