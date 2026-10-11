#!/usr/bin/env bash
# release.sh — reusable release template (since 2026-10-03; generalized from release-ending.sh)
# Usage: run `bash scripts/release.sh` in Git Bash.
# Prerequisite: write this release's commit message to .tmp/release-msg.txt (first line is the title). Without it nothing is released.
# Order follows the standard flow in AGENTS.md: sync with GitHub -> [backend drift pre-check] -> backend + unit tests -> build -> commit + push -> [wait for CI green] -> deploy.sh -> online verification.
# deploy.sh 内部顺序:构建 → **后端先同步**(md5 复核)→ 前端 dist 上传 → 解压清理 → 重启 → 漂移复检 → 模型 → 线上验证。
#   后端在前是有意为之:新后端对旧前端兼容,反过来(旧后端 + 新前端)会让新页面打到不存在的接口上。
# CI gate (added 2026-10-11): deploy is blocked until this commit's CI run reports conclusion=success. Bypass with --no-ci or SKIP_CI_GATE=1 (fails-closed default).
# Any failing step stops immediately, so a half-finished build is never pushed or deployed;失败时输出 RELEASE_FAILED,成功时输出 RELEASE_OK。All output goes to .tmp/release.log.
#
# Only code directories are committed (src/ lib/ scripts/ types/ public/ and already-tracked root files).
# WARNING: the repository is public. Before committing, files that look like .env / private keys / certificates / names containing "私钥" (private key) or "secret" are blocked automatically.
set -e -o pipefail
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"
mkdir -p .tmp
exec > >(tee .tmp/release.log) 2>&1
# 已知小毛病(2026-10-12 实测后刻意**不**修):tee 是后台子进程,脚本在输出很少时先退出,
# .tmp/release.log 可能被截掉最后几行。终端里的输出是完整的,判定成败请看终端与退出码。
# (想改成 `TEEPID=$!; trap 'wait $TEEPID' EXIT` 的话先在 Windows Git Bash 上验:实测会挂住 ——
#  wait 等的是一个还挂在同一根管道上的子进程,发布脚本因此从"日志少几行"变成"卡死",更糟。)

MSG=.tmp/release-msg.txt

# --- CI gate (added 2026-10-11). Fail-closed by default: after git push we wait for THIS commit's CI
#     run to reach conclusion=success, and only then deploy. This flips release.sh from "deploy first,
#     CI verifies after the fact" into a real pre-deploy gate. --no-ci / SKIP_CI_GATE=1 is the escape hatch. ---
CI_GATE=1
YES=0
NO_CI_GIVEN=0
# 注意:这里必须**保留**同名环境变量(release 时用 NO_CI_REASON="..." 传原因),
# 早期版本写成 NO_CI_REASON="" 会把环境里的原因清掉,于是"给了原因"也判成没给。
NO_CI_REASON="${NO_CI_REASON:-}"
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --no-ci) CI_GATE=0; NO_CI_GIVEN=1 ;;
    --no-ci=*) CI_GATE=0; NO_CI_GIVEN=1; NO_CI_REASON="${a#--no-ci=}" ;;
    -h|--help)
      echo "用法: bash scripts/release.sh [--yes] [--no-ci=<原因>]"
      echo "  默认: 测试/构建/commit/push 之后,等本次 commit 的 CI(工作流 CI)跑绿才调用 deploy.sh。"
      echo "  --yes  非交互整套发布:把 --yes 透传给 deploy.sh(再到 backend-sync.sh),不弹任何 y/N。"
      echo "         不加它又在非交互终端里跑,后端同步会硬失败(exit 4),整条发布中止 —— 这是有意的。"
      echo "  --no-ci=<原因>  跳过 CI 闸门(逃生门,应急用),但**必须**写原因;"
      echo "                 也可用环境变量:SKIP_CI_GATE=1 NO_CI_REASON='原因'。"
      echo "                 没有原因的逃生门 = 没有闸门,所以空原因直接拒绝执行。"
      echo "                 每次绕过都会追加一行到 .tmp/no-ci-audit.log(gitignored,本地留痕)。"
      exit 0 ;;
  esac
done
[ "${SKIP_CI_GATE:-0}" = "1" ] && { CI_GATE=0; NO_CI_GIVEN=1; }

# --- 逃生门必须可归因(2026-10-12):--no-ci 不再是"一个开关",而是"一个开关 + 一句原因"。 ---
# 不加原因就拒绝执行(而不是默默记个"未给原因"):半年后没人记得当时为什么绕过,
# 那条日志就只是噪音;要应急的人敲一句原因的成本,远低于一次无法复盘的事故。
if [ "$CI_GATE" = "0" ]; then
  if [ -z "$NO_CI_REASON" ]; then
    echo "❌ 已要求跳过 CI 闸门,但没给原因。"
    echo "   逃生门保留,只是必须署名:  bash scripts/release.sh --yes --no-ci=\"CF 边缘缓存卡住,先回滚前端\""
    echo "   或                       :  SKIP_CI_GATE=1 NO_CI_REASON=\"...\" bash scripts/release.sh --yes"
    echo "RELEASE_FAILED(未构建、未提交、未部署)"
    exit 1
  fi
  mkdir -p .tmp
  AUDIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  AUDIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  AUDIT_ACTOR="$(gh api user --jq .login 2>/dev/null || echo "${USER:-${USERNAME:-unknown}}")"
  AUDIT_LINE=$(printf 'NO_CI_AUDIT ts=%s actor=%s branch=%s commit=%s ci_gate=BYPASSED reason=%s' \
    "$(date -Iseconds 2>/dev/null || date)" "$AUDIT_ACTOR" "$AUDIT_BRANCH" "$AUDIT_COMMIT" "$NO_CI_REASON")
  printf '%s\n' "$AUDIT_LINE" >> .tmp/no-ci-audit.log
  # 同一条也进本次发布日志(stdout 正被 tee 到 .tmp/release.log),让"看日志的人"和"看台账的人"读到同一句话
  echo "::AUDIT:: $AUDIT_LINE"
  echo "   (逃生门已记账:.tmp/no-ci-audit.log;线上将先发、CI 后验(甚至最终红),后果自负。)"
fi

# --help 可在没有 commit 信息时查看,故 MSG 检查放在参数解析之后
[ -s "$MSG" ] || { echo "❌ Missing $MSG (the commit message for this release); stopping"; echo "RELEASE_FAILED(未构建、未提交、未部署)"; exit 1; }

# 0 = 绿  1 = 红/未完成  2 = 无法确认(gh 缺失/未登录/离线/无 run)。三种非 0 全部阻断(fail-closed)。
ci_gate() {
  local SHA RID ST CONCL i
  SHA=$(git rev-parse HEAD)
  echo "待验证 commit: $SHA"
  if ! command -v gh >/dev/null 2>&1; then echo "❌ 本机没有 gh CLI,无法确认 CI → 默认阻断部署(要跳过用 --no-ci)。"; return 2; fi
  if ! gh auth status >/dev/null 2>&1; then echo "❌ gh 未登录/无凭据/离线,无法确认 CI → 默认阻断部署(要跳过用 --no-ci)。"; return 2; fi
  RID=""
  for i in $(seq 1 20); do
    RID=$(gh run list --commit "$SHA" --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
    { [ -n "$RID" ] && [ "$RID" != "null" ]; } && break
    echo "  …等本次 commit 的 CI run 登记 (${i}/20)"; sleep 6
  done
  if [ -z "$RID" ] || [ "$RID" = "null" ]; then echo "❌ 超时:GitHub 未为该 commit 生成 CI run(工作流没触发/网络?)→ 默认阻断部署。"; return 2; fi
  CI_RUN_ID="$RID"; export CI_RUN_ID
  echo "  找到 CI run: $RID,等待跑完…"
  CONCL=""
  for i in $(seq 1 60); do
    ST=$(gh run view "$RID" --json status --jq '.status' 2>/dev/null || true)
    if [ "$ST" = "completed" ]; then
      # 判定只读 conclusion 字段本身,绝不用管道退出码(AGENTS 血泪:cmd | tail 的 $? 属于 tail,不是命令)
      CONCL=$(gh run view "$RID" --json conclusion --jq '.conclusion' 2>/dev/null || true)
      break
    fi
    echo "  CI 进行中: status=${ST:-?} (${i}/60)"; sleep 15
  done
  if [ "$CONCL" = "success" ]; then echo "✅ CI 通过 (conclusion=success, run=$RID)"; return 0; fi
  echo "❌ CI 未通过或未在时限内完成 (conclusion=${CONCL:-<超时未跑完>}, run=$RID)。"
  echo "   查失败原因: gh run view $RID --log-failed   或   gh run view $RID --web"
  return 1
}

echo "=== 1/9 Check branch and GitHub are in sync ==="
git fetch origin
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "❌ Not on the main branch; stopping"; echo "RELEASE_FAILED"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ Local main differs from GitHub; stopping (resolve this first)"; echo "RELEASE_FAILED"; exit 1; }

echo "=== 2/9 后端漂移预检(只读,不上传任何东西) ==="
# 为什么放在构建/提交之前:2026-10-11 那次是 release.sh 一路跑到部署阶段才发现"后端没同步",
# 白烧十几分钟构建与测试,还把"新前端 + 旧后端"留在线上。预检把结论提前到还能反悔的地方。
# backend-sync.sh --check 的结论是退出码:0=一致 5=有差异,其余(无密钥/网络不通)=这里判不了。
PRE_RC=0
bash scripts/backend-sync.sh --check > .tmp/backend-precheck.log 2>&1 || PRE_RC=$?
if [ "$PRE_RC" = "0" ]; then
  echo "✅ 后端与服务器一致,本次发布不涉及后端"
elif [ "$PRE_RC" = "5" ]; then
  echo "ℹ️ 后端有文件与服务器不同(名单见 .tmp/backend-precheck.log),部署时会先同步后端再上传前端。"
  if [ "$YES" != "1" ] && [ ! -t 0 ]; then
    echo "❌ 但当前 stdin 不是交互终端,又没给 --yes —— 后端同步会在部署阶段硬失败(exit 4)。"
    echo "   与其跑完构建再失败,现在就把话说明:整套非交互发布请用  bash scripts/release.sh --yes"
    echo "   人工交互发布请在 Git Bash 终端里直接运行   bash scripts/release.sh"
    echo "RELEASE_FAILED(未构建、未提交、未部署)"
    exit 1
  fi
else
  echo "⚠️ 预检判不了(exit $PRE_RC:多半是本机没有可用私钥或连不上服务器),继续发布;"
  echo "   部署阶段后端同步仍会按退出码硬判定,不会静默放过。"
fi

echo "=== 3/9 Backend tests + unit tests ==="
npm test       # 5 个后端脚本:test-store(原子写) / test(后端 API) / test-session(会话与吊销) / test-upload-security(上传门禁) / test-mobile
npx vitest run # frontend unit tests

echo "=== 4/9 Production build (trial) ==="
# 不能写成 `npm run build 2>&1 | tail -5`:`-o pipefail` 在 `set -e` 下让整条管道的状态成为脚本状态,
# 于是每次发布都停在第 3 步且构建的真实报错被 tail 吃掉。改落盘、读码、再摘错误行。
BUILD_LOG=.tmp/build.log
BUILD_RC=0
npm run build > "$BUILD_LOG" 2>&1 || BUILD_RC=$?
if [ "$BUILD_RC" != "0" ]; then
  echo "❌ 构建失败(exit $BUILD_RC),已停止(完整输出见 $BUILD_LOG)"
  grep -E 'error|Error|ERROR' "$BUILD_LOG" | tail -20 || true
  echo "RELEASE_FAILED(未提交、未部署)"
  exit 1
fi
grep -E 'built in|modules transformed' "$BUILD_LOG" | tail -2

echo "=== 5/9 Stage changes and check them ==="
git add -u
for d in src lib scripts types public; do [ -d "$d" ] && git add "$d"; done
STAGED=$(git diff --cached --name-only)
[ -n "$STAGED" ] || { echo "❌ Nothing to commit; stopping"; exit 1; }
echo "$STAGED"
# Allowlist: the leak-prevention unit test itself (its file name contains "secret"; it was blocked by mistake on 2026-10-04),
# and .env.example (a values-free template — every assignment in it is intentionally empty; blocked by mistake on 2026-10-11
# because the guard's `(^|/)\.env` also matches the sample file that documents those very variables).
if echo "$STAGED" | grep -vE '^(src/__tests__/no-secrets\.test\.js|\.env\.example)$' | grep -Eiq '(^|/)\.env|\.pem$|\.key$|\.p12$|\.pfx$|\.ppk$|私钥|secret'; then
  echo "❌ Staged files look like secrets; stopping (public repo!)"; git reset -q; exit 1
fi

echo "=== 6/9 Commit and push to GitHub ==="
git commit -F "$MSG"
git push origin main

echo "=== 7/9 CI gate: only deploy after this commit's CI goes green ==="
if [ "$CI_GATE" = "1" ]; then
  if ci_gate; then
    echo "→ CI 绿,继续部署"
  else
    echo ""
    echo "=== 已停止:线上【未】更新。代码已 push 到 GitHub,只是没有部署。 ==="
    echo "   (闸门默认 fail-closed:CI 红/取不到/离线都不部署,避免把坏版本先推上线。)"
    echo "   想修好再发:  改完代码重跑 bash scripts/release.sh"
    echo "   确认要强行部署已推送的这个 commit(绕过闸门,后果自负):"
    echo "       bash scripts/deploy.sh --yes            # 直接部署当前 HEAD(=刚 push 的 commit)"
    echo "   或整条流水线带逃生门重跑(必须写原因,否则拒绝执行):"
    echo "       bash scripts/release.sh --yes --no-ci=\"为什么现在就要发\""
    echo "RELEASE_FAILED(已 push,未部署)"
    exit 1
  fi
else
  echo "⚠️⚠️⚠️ 已用 --no-ci / SKIP_CI_GATE=1 跳过 CI 闸门:线上将先发、CI 后验(甚至最终红)。这是有意的逃生门,后果自负。"
  echo "   台账尾部(.tmp/no-ci-audit.log):"
  tail -n 1 .tmp/no-ci-audit.log 2>/dev/null || true
fi

echo "=== 8/9 Deploy to the server (后端先行 → 前端 dist → 重启 → 模型 → 验证 → 漂移复检) ==="
# deploy.sh 现在自己保证"后端没上去就中止"(exit 3/4/5/6 都会一路传到这里),
# 所以这里非 0 只能是真失败 —— 绝不能再打印 RELEASE_OK 让半吊子发布看起来像成功。
rm -f .tmp/deploy-state.env          # 别拿上一次的快照判断这一次
DEP_ARGS=""
[ "$YES" = "1" ] && DEP_ARGS="--yes"
DEP_RC=0
bash scripts/deploy.sh $DEP_ARGS || DEP_RC=$?
if [ "$DEP_RC" != "0" ]; then
  echo ""
  echo "=== ❌ 发布未完成:deploy.sh 以 exit $DEP_RC 退出。代码已 push 到 GitHub,线上状态见下面的快照。 ==="
  if [ -f .tmp/deploy-state.env ]; then
    echo "   --- .tmp/deploy-state.env(deploy.sh 自己写的结论) ---"
    sed 's/^/   /' .tmp/deploy-state.env
  else
    echo "   (没有状态快照 ⇒ deploy.sh 死得很早,基本可以确定什么都没发出去)"
  fi
  FS=not-run
  [ -f .tmp/deploy-state.env ] && FS=$(awk -F= '/^FRONTEND=/{print $2}' .tmp/deploy-state.env)
  case "$FS" in
    not-run)
      echo "   结论:前端【未】上传 ⇒ 线上仍是完整的旧版本(前后端同源),没有新前端打旧接口的窗口。" ;;
    staged-tmp)
      echo "   结论:前端包只到了服务器 /tmp、【未】解包 ⇒ 线上前端还是旧版(后端可能已是新版)。" ;;
    extracted)
      echo "   结论:前端【已】解包生效 ⇒ 线上已是新前端。若 BACKEND 不是 verified/uploaded,现在就是「新前端 + 旧后端」,必须立刻补。" ;;
    *)
      echo "   结论:前端状态字段=$FS(不认识的值)—— 按【已上传】对待,宁可当半成品处理。" ;;
  esac
  echo "   把后端补上(唯一能让前后端同源的命令):bash scripts/backend-sync.sh --yes"
  echo "   然后单独补部署(不重走测试/提交):      bash scripts/deploy.sh$([ "$YES" = "1" ] && echo " --yes")"
  echo "   再核对线上字节是否等于本地:bash scripts/verify-drift.sh"
  echo "RELEASE_FAILED exit=$DEP_RC"
  exit 1
fi

echo "=== 9/9 发布级独立复检(只读;deploy.sh 里已经跑过一遍,这里独立再确认一次后端真的同源) ==="
# 为什么独立再跑一次:第 7 步的成败是 deploy.sh 自己的结论;发布这一层的"成功"要有自己的证据。
# 只比后端(--backend-only)是因为前端全量比对已在 deploy.sh 第 5 步跑过,不必把 136 个文件再算一遍。
VD_RC=0
bash scripts/verify-drift.sh --backend-only || VD_RC=$?
if [ "$VD_RC" != "0" ]; then
  echo ""
  echo "=== ❌ 发布未完成:后端漂移独立复检 exit $VD_RC(1=不一致,2=没比成)。 ==="
  echo "   线上很可能是「新前端 + 旧后端」。立刻:bash scripts/backend-sync.sh --yes"
  echo "   补完再核对:bash scripts/verify-drift.sh --backend-only"
  echo "RELEASE_FAILED drift-check=$VD_RC"
  exit 1
fi

rm -f "$MSG"
echo ""
echo "RELEASE_OK $(git rev-parse --short HEAD)"
