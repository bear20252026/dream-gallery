#!/usr/bin/env bash
# release.sh — reusable release template (since 2026-10-03; generalized from release-ending.sh)
# Usage: run `bash scripts/release.sh` in Git Bash.
# Prerequisite: write this release's commit message to .tmp/release-msg.txt (first line is the title). Without it nothing is released.
#
# ⚠️2026-10-14 起:发布流程改成 **分支 → PR → CI 绿 → 合并 → 才部署**(主人拍板"合并")。
# 顺序现在是:对齐 GitHub → 后端漂移预检 → 测试 → 构建 → 把本次内容放到 rel/<时间戳> 分支上提交
#   → push 分支 → 开 PR → **`gh pr merge --auto`**(GitHub 只在 required checks 过了才真合)
#   → 轮询到 MERGED 并取 merge commit → **核对"CI 验过的那棵树"与"要部署的那棵树"是同一棵**
#   → deploy.sh → 线上验证 → 后端漂移独立复检。
# 为什么要绕这一圈(而不是像以前直推 main):分支保护开着 required checks 但 `enforce_admins=false`,
#   于是直推 main 完全绕开闸门 —— "CI 必须通过"这件事过去只靠 release.sh 自己在 push **之后**
#   等结论(第 7 步旧版),而 push 本身已经落地了。走 PR 之后,"红的项目根本合不进 main",
#   闸门从"我自觉"变成"机器不许"。
# deploy.sh 内部顺序:构建 → **后端先同步**(md5 复核)→ 前端 dist 上传 → 解压清理 → 重启 → 漂移复检 → 模型 → 线上验证。
#   后端在前是有意为之:新后端对旧前端兼容,反过来(旧后端 + 新前端)会让新页面打到不存在的接口上。
# CI gate fail-closed:合并失败/被关/超时一律不部署。逃生门 --no-ci 仍要署名,且它现在绕过的是
#   "必须绿才许合并"这一条(用 --admin 强合),每次绕过都进 .tmp/no-ci-audit.log。
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
NO_DEPLOY=${NO_DEPLOY:-0}
# GH_BIN/BRANCH_PREFIX 只为"不碰 GitHub"的离线演练留的注入口(与 deploy.sh 的 SSH_BIN/SCP_BIN 同一手法):
# 演练时把 GH_BIN 指到一个假 gh,就能验证"分支 → PR → 合并 → 快进本地 main"这段 git 机械动作,
# 而不会真的在公开仓开 PR。默认就是 gh,正常发布无需设置。
GH_BIN="${GH_BIN:-gh}"
BRANCH_PREFIX="${BRANCH_PREFIX:-rel}"
REL_BR=""
# 注意:这里必须**保留**同名环境变量(release 时用 NO_CI_REASON="..." 传原因),
# 早期版本写成 NO_CI_REASON="" 会把环境里的原因清掉,于是"给了原因"也判成没给。
NO_CI_REASON="${NO_CI_REASON:-}"
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --no-deploy) NO_DEPLOY=1 ;;
    --no-ci) CI_GATE=0; NO_CI_GIVEN=1 ;;
    --no-ci=*) CI_GATE=0; NO_CI_GIVEN=1; NO_CI_REASON="${a#--no-ci=}" ;;
    -h|--help)
      echo "用法: bash scripts/release.sh [--yes] [--no-ci=<原因>]"
      echo "  默认: 测试/构建 → 内容放到 rel/<时间戳> 分支 → 开 PR → **等 required checks 绿了才合并**"
      echo "        (gh pr merge --auto,GitHub 自己把关)→ 核对 CI 验过的树 = 要部署的树 → deploy.sh。"
      echo "  --yes  非交互整套发布:把 --yes 透传给 deploy.sh(再到 backend-sync.sh),不弹任何 y/N。"
      echo "         不加它又在非交互终端里跑,后端同步会硬失败(exit 4),整条发布中止 —— 这是有意的。"
      echo "  --no-ci=<原因>  跳过闸门(逃生门):不再等绿,用 --admin 强行合并。必须写原因,"
      echo "                 也可用环境变量 SKIP_CI_GATE=1 NO_CI_REASON='原因'。"
      echo "                 没有原因的逃生门 = 没有闸门,所以空原因直接拒绝执行。"
      echo "                 每次绕过都会追加一行到 .tmp/no-ci-audit.log(gitignored,本地留痕)。"
      echo "  想只发当前已合并的版本(没有新内容):bash scripts/deploy.sh --yes"
      echo "  --no-deploy  只走「分支 → PR → 绿 → 合并」,**不部署**。"
      echo "                 给「只改脚本/文档」这类不上线的内容用(否则每次都得重启一次线上)。"
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

# (2026-10-14)原来这里有个 ci_gate():push 到 main 之后由脚本自己轮询 CI 结论,绿了才部署。
# 现在闸门挪到了 GitHub 那一侧 —— PR 的 required checks 不绿就**合不进去**,所以"红版本已经
# 落在 main 上"这件事本身不再可能发生,轮询函数随之删除。第 7 步只读 PR 的 state/mergeCommit
# 字段判成败(绝不信 `gh pr checks --watch` 的退出码:它断网也返回 0)。

echo "=== 1/9 对齐 GitHub,并把本次发布内容放到发布分支上(main 不再直推)==="
git fetch origin
CUR=$(git rev-parse --abbrev-ref HEAD)
[ "$CUR" != "HEAD" ] || { echo "❌ 现在是游离 HEAD(detached),不发布"; echo "RELEASE_FAILED"; exit 1; }
git show-ref --verify --quiet refs/heads/main || { echo "❌ 本地没有 main 分支(不该发生)"; echo "RELEASE_FAILED"; exit 1; }
BEHIND=$(git rev-list --count main..origin/main)
[ "$BEHIND" = "0" ] || { echo "❌ 本地 main 落后 GitHub ${BEHIND} 个提交;先把 main 对齐(不要带着旧 base 发布)"; echo "RELEASE_FAILED"; exit 1; }
# 本次要发的内容 = 相对 origin/main 已提交的东西 + 工作树里未提交的代码改动
AHEAD=$(git rev-list --count origin/main..HEAD)
DIRTY=$(git status --porcelain --untracked-files=no)
if [ "$AHEAD" = "0" ] && [ -z "$DIRTY" ]; then
  echo "❌ 相对 GitHub 的 main 没有任何新内容(既无未推送提交,也无未提交改动)。"
  echo "   要重发**当前这个版本**(不新内容)请直接:bash scripts/deploy.sh --yes"
  echo "   要改点什么再发:先按分层提交做好改动,再跑本脚本。"
  echo "RELEASE_FAILED(未构建、未开 PR、未部署)"
  exit 1
fi
case "$CUR" in
  "$BRANCH_PREFIX"/*)
    # 上一次跑到一半中断(比如 CI 红了)留下的发布分支:接着用它,不新建第二个分支
    echo "ℹ️  已在发布分支 $CUR 上(未推送提交 ${AHEAD} 个),继续用它"
    ;;
  *)
    REL_BR="$BRANCH_PREFIX/$(date +%Y%m%d-%H%M%S)"
    git switch -c "$REL_BR"
    # ⚠️切完必须把 CUR 指到新分支:CUR 是在切之前取的(那时它是 "main"),漏了这一行就会
    #   `git push -u origin main` ⇒ 推上去的是**远端已有的旧 main**("Everything up-to-date"),
    #   然后 PR 的 --head 也是 main,整个流程验的是旧内容。2026-10-14 离线演练实锤抓到。
    CUR="$REL_BR"
    # main 指针退回远端:上面那些提交此刻**同时**在 $REL_BR 上,一个都没丢;
    # 这样"合并后本地 main 快进到 origin/main"才是干净的快进,也不会把未合并的东西留在 main 上。
    git branch -f main origin/main || { echo "❌ 无法把本地 main 指回 origin/main(是不是另一个 worktree 正检出它?)"; echo "RELEASE_FAILED"; exit 1; }
    echo "→ 本次发布内容已放到 $REL_BR;本地 main 指回 origin/main(合并后再快进)"
    ;;
esac

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
# 工作树干净(改动已经全部是 HEAD 上的提交)≠ 没东西可发布。
# 旧版在这里 `exit 1`,于是"先分层提交、再跑 release.sh"这条最规范的路径必然失败,只能退回手搓
# `deploy.sh --yes` —— 而 deploy.sh 不经过第 7 步的 CI 闸门:**越规范的提交习惯反而越没有闸门**,
# 2026-10-12 的发布就是这样被迫绕过闸门的(我当时手工读了两个 required check 的 conclusion 补上)。
# 现在:跳过 commit,push 照做(把已提交的 HEAD 推上去),CI 闸门与部署一律照常,一个安全面都不减。
# .tmp/release-msg.txt 的前置要求刻意**保留**:它是这次发布的说明书,不是"必须有东西可提交"的条件。
if [ -z "$STAGED" ]; then
  echo "ℹ️  工作区无待提交改动 ⇒ 跳过 git commit;本次发布内容 = 当前 HEAD $(git rev-parse --short HEAD)"
  echo "    (仍照常 push、仍等本次 HEAD 的 CI 绿、仍走 deploy —— 闸门不因'没东西可提交'而消失)"
else
  echo "$STAGED"
  # Allowlist: the leak-prevention unit test itself (its file name contains "secret"; it was blocked by mistake on 2026-10-04),
  # and .env.example (a values-free template — every assignment in it is intentionally empty; blocked by mistake on 2026-10-11
  # because the guard's `(^|/)\.env` also matches the sample file that documents those very variables).
  if echo "$STAGED" | grep -vE '^(src/__tests__/no-secrets\.test\.js|\.env\.example)$' | grep -Eiq '(^|/)\.env|\.pem$|\.key$|\.p12$|\.pfx$|\.ppk$|私钥|secret'; then
    echo "❌ Staged files look like secrets; stopping (public repo!)"; git reset -q; exit 1
  fi
fi

echo "=== 6/9 提交 → 推发布分支 → 开 PR ==="
# 写成 if/else 而不是 `[ -n "$STAGED" ] && git commit || echo`:后者在 `set -e` 下会把 commit 的失败
# 吞成一句"未新建 commit"然后继续发布 —— commit 失败必须响亮停下,不能让远端少一个提交而线上照发。
if [ -n "$STAGED" ]; then
  git commit -F "$MSG"
else
  echo "(无新增改动可提交 ⇒ 本次发布内容 = $CUR 上已有的 $(git rev-list --count origin/main..HEAD) 个提交)"
fi
HEAD_SHA=$(git rev-parse HEAD)
git push -u origin "$CUR"

PR_TITLE=$(head -n 1 "$MSG")
PR_BODY=$(sed -n '2,$p' "$MSG" | head -n 60)
# ⚠️不要用 `gh pr create --json ...`:本机这版 gh 的 pr create **没有 --json**(2026-10-14 真实运行
#   实锤 "unknown flag: --json")。它默认就把 PR 的 URL 打到 stdout,编号从 URL 尾巴上取;
#   取不到编号就 fail-closed 停手(绝不猜一个编号去合并 —— 那可能合掉别人的 PR)。
PR_OUT=$("$GH_BIN" pr create --base main --head "$CUR" --title "$PR_TITLE" --body "$PR_BODY" 2>&1) || {
  # 分支上已经有 PR(上一次发布中途失败 ⇒ 本次在同一个 rel 分支上接着跑)⇒ 复用它,不算失败。
  EXIST=$("$GH_BIN" pr view --json number,url 2>/dev/null || true)
  case "$EXIST" in
    *'"number"'*)
      PR_URL=$(printf '%s' "$EXIST" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p' | head -1)
      PR_NUM=$(printf '%s' "$EXIST" | sed -n 's/.*"number":[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)
      echo "ℹ️  分支 $CUR 上已有 PR #$PR_NUM(${PR_URL:-无 URL}),本次复用它"
      ;;
    *)
      echo "❌ 开 PR 失败(gh 未登录/离线/网络?),而且这个分支上也没有可复用的 PR:"; printf '%s\n' "$PR_OUT" | head -6
      echo "   分支已推送($CUR),没有合并、没有部署。可以在 GitHub 上手工开 PR 再合。"
      echo "RELEASE_FAILED(未合并、未部署)"; exit 1 ;;
  esac
}
if [ -z "${PR_NUM:-}" ]; then
  PR_URL=$(printf '%s' "$PR_OUT" | grep -oE 'https?://[^[:space:]]+/pull/[0-9]+' | head -1)
  PR_NUM=${PR_URL##*/}
fi
case "$PR_NUM" in
  ''|*[!0-9]*)
    echo "❌ 从 gh 的输出里没解析出 PR 编号,停手(不猜编号去合并)。原始输出:"; printf '%s\n' "$PR_OUT" | head -6
    echo "RELEASE_FAILED(未合并、未部署)"; exit 1 ;;
esac
echo "→ PR #$PR_NUM $PR_URL (head=$HEAD_SHA)"

echo "=== 7/9 闸门:required checks 绿了才合并(闸门挪到 GitHub 那边,不再靠我自觉) ==="
if [ "$CI_GATE" = "0" ]; then
  echo "⚠️⚠️⚠️ 已用 --no-ci / SKIP_CI_GATE=1:下面用 --admin **无视检查结论强行合并**。这是有意的逃生门,后果自负。"
  tail -n 1 .tmp/no-ci-audit.log 2>/dev/null || true
  "$GH_BIN" pr merge "$PR_NUM" --merge --admin || { echo "❌ 强制合并失败"; echo "RELEASE_FAILED(未部署)"; exit 1; }
else
  # 不用 `--auto`:它是仓库级开关,本仓默认关着 ⇒ `GraphQL: Auto merge is not allowed for this
  # repository`(2026-10-14 真实运行撞到)。改成自己按**字段**轮询 required checks,绿了才 merge。
  # ⚠️required contexts 从分支保护**动态读**,不写死在脚本里 —— 写死就会在保护改了之后悄悄失配。
  REPO_SLUG=$("$GH_BIN" repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)
  [ -n "$REPO_SLUG" ] || { echo "❌ 取不到 owner/repo,无法读分支保护 ⇒ 闸门没有依据,不合并"; echo "RELEASE_FAILED(未部署)"; exit 1; }
  REQ_CTX=$("$GH_BIN" api "repos/$REPO_SLUG/branches/main/protection" --jq '.required_status_checks.contexts[]' 2>/dev/null || true)
  [ -n "$REQ_CTX" ] || { echo "❌ 读不到 required contexts(保护被改了/离线?)⇒ 判不了就不合,不部署"; echo "RELEASE_FAILED(未部署)"; exit 1; }
  echo "→ required checks:$(printf '%s' "$REQ_CTX" | tr '\n' ' ')"
  VERDICT=""
  for i in $(seq 1 80); do
    ROLL=$("$GH_BIN" pr view "$PR_NUM" --json statusCheckRollup 2>/dev/null || echo '')
    VERDICT=$(printf '%s' "$ROLL" | node scripts/admin/checks-verdict.cjs "$REQ_CTX" 2>/dev/null || echo "ERROR 判定器跑不起来")
    case "$VERDICT" in
      PASS) break ;;
      FAIL*) echo "❌ required checks 有红:$VERDICT"; echo "   看日志:gh pr view $PR_NUM --json statusCheckRollup | node scripts/admin/checks-verdict.cjs '<contexts>'  或  $PR_URL/checks"; echo "   结论:**不合并、不部署**(红了的项目根本进不了 main)。"; echo "   修好再跑本脚本;确实要强行上线:$0 --yes --no-ci=\"为什么\"(会署名进台账)"; echo "RELEASE_FAILED(未合并、未部署)"; exit 1 ;;
      ERROR*) echo "❌ 判定器没有依据($VERDICT)⇒ 判不了不等于过,停手"; echo "RELEASE_FAILED(未部署)"; exit 1 ;;
      *) echo "  CI 未完:$VERDICT (${i}/80)"; sleep 15 ;;
    esac
  done
  [ "$VERDICT" = "PASS" ] || { echo "❌ 超时 20 分钟 required checks 仍未全绿($VERDICT);不合并、不部署"; echo "RELEASE_FAILED(未部署)"; exit 1; }
  echo "✅ required checks 全绿 ⇒ 可以合并"
  "$GH_BIN" pr merge "$PR_NUM" --merge --delete-branch || { echo "❌ 合并失败(即便绿了,GitHub 也可能因新 push 把结论判旧)"; echo "RELEASE_FAILED(未部署)"; exit 1; }
fi
STATE=""; MERGE_SHA=""
for i in $(seq 1 80); do
  VIEW=$("$GH_BIN" pr view "$PR_NUM" --json state,mergeCommit 2>/dev/null || echo '{}')
  STATE=$(printf '%s' "$VIEW" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p' | head -1)
  MERGE_SHA=$(printf '%s' "$VIEW" | sed -n 's/.*"oid":"\([0-9a-fA-F]\{40\}\)".*/\1/p' | head -1)
  if [ "$STATE" = "MERGED" ] && [ -n "$MERGE_SHA" ]; then break; fi
  if [ "$STATE" = "CLOSED" ]; then
    echo "❌ PR #$PR_NUM 是**关闭且未合并**的(有人在检查红之后关掉了它?)⇒ 不部署。"
    echo "   看是哪一步红:  gh pr checks $PR_NUM    或    ${PR_URL:-}/checks"
    echo "RELEASE_FAILED(未合并、未部署)"; exit 1
  fi
  echo "  还没合并(state=${STATE:-?},第 ${i}/80 次)…"; sleep 15
done
if [ "$STATE" != "MERGED" ] || [ -z "$MERGE_SHA" ]; then
  echo "❌ 超时 20 分钟 PR #$PR_NUM 仍是 ${STATE:-?};不部署(线上保持完整旧版本)。"
  echo "   继续观察:gh pr checks $PR_NUM   |   ${PR_URL:-}"
  echo "RELEASE_FAILED(未部署)"; exit 1
fi
echo "✅ 已合并进 main:merge commit $MERGE_SHA"
# ⚠️下面这句才是"CI 验过的 = 我要发的"的真正凭据:比两棵树的哈希。
#   required checks 跑在 PR head 上;要是合并窗口里 main 被别人推进了,merge commit 的树就可能
#   不等于被验过的那棵树 —— 那时"绿"证明不了我这次要部署的内容。树不同就停下重跑,不含糊。
git fetch origin
HEAD_TREE=$(git rev-parse "$HEAD_SHA^{tree}")
MERGE_TREE=$(git rev-parse "$MERGE_SHA^{tree}" 2>/dev/null || echo "")
if [ "$HEAD_TREE" != "$MERGE_TREE" ]; then
  echo "❌ merge commit 的树与 CI 验过的那棵**不一致**(${HEAD_TREE} vs ${MERGE_TREE:-读不到})。"
  echo "   多半是合并期间 main 前进了 ⇒ 重跑 bash scripts/release.sh(基于新的 main 重新验证一遍)。"
  echo "RELEASE_FAILED(未部署)"; exit 1
fi
echo "→ 树哈希一致($HEAD_TREE)⇒ CI 绿的那份内容就是这次要部署的内容"
# 给 deploy.sh 的日志留一个 run 号(纯报告,不参与判定 —— 判定已经在"能不能合并"那一步由 GitHub 做完了)
CI_RUN_ID=$("$GH_BIN" run list --commit "$HEAD_SHA" --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
export CI_RUN_ID
# 本地 main 快进到远端结果;发布分支的提交已在 main 上,本地那份用完即删
git switch main
git merge --ff-only "$MERGE_SHA" || { echo "❌ 本地 main 快进不到 $MERGE_SHA(不该发生)"; echo "RELEASE_FAILED(未部署)"; exit 1; }
git branch -D "$CUR" 2>/dev/null || true

if [ "$NO_DEPLOY" = "1" ]; then
  echo "=== 8/9 与 9/9 已按 --no-deploy 跳过 ⇒ 内容【只】合并进了 main,线上未做任何改动 ==="
  rm -f "$MSG"
  echo "RELEASE_MERGED_ONLY $(git rev-parse --short HEAD)(要上线:bash scripts/deploy.sh --yes)"
  exit 0
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
  echo "=== ❌ 发布未完成:deploy.sh 以 exit $DEP_RC 退出。代码已合并进 main(GitHub),线上状态见下面的快照。 ==="
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
