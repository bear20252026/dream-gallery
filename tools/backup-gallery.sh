#!/bin/bash
# backup-gallery.sh — 梦幻画廊数据备份(2026-07-28 主人定;2026-10-17 整改两条被审计点中的病,均经回读源码证实)
#
# ① 旧版 `tar … 2>/dev/null || true` 把打包失败整个吞掉,下一行**无条件**轮转 ⇒ 残缺/根本没能生成的当日档
#    照样报 "backup daily done",并把第 14 份完好备份顶掉;14 天代际用尽后访客数据不可恢复。
#    而 tar 恰恰最容易在**活库**上失败:服务端边写边打包,"file changed as we read it" 就是 exit 1
#    (旧版连这个一起吞)。⇒ 现在:**不信任 tar 的退出码,信任归档文件本身**。
# ② 旧恢复集只有 `gate_data.json`。**2026-09-01 起权威存储是 SQLite `gate_data.db`(WAL),json 只是镜像**
#    ⇒ 两条介质会分叉(SQLite 写成而镜像没跟上那次,按备份恢复就永久丢);另外 `.r2-outbox.json`
#    (R2 待发台账 —— 丢了就是 CDN 分歧不可自愈)、根级 `data.js`(演示照片表)、`scripts/`(含对账脚本)都不在档里。
#
# 流程:落 `.part` →(best-effort WAL checkpoint)→ tar → `tar tzf` 必须能列出且必检成员齐全 → `mv` 上位 → **上位成功才轮转**
# ⇒ 任何一步不成都打 `BACKUP_FAILED mode=… reason=…` 并非零退出(cron 会留痕/发信,这是刻意从"永远成功"改过来的)。
#
# 刻意不进 daily(是决定,不是漏做,恢复时按这三条另行处理):
#   `.env`    密钥,主人手工管(与数据同盘再滚 14 份不划算)
#   `models/` 约 495M,线上为源 + R2 镜像;恢复走 scripts/r2-upload*.cjs 重镜像
#   `dist/`   构建产物,可由源码重建(本项目构建**不可复现**,存产物没有意义)
# 调度(cron): 17 3 * * * daily / 23 4 * * 0 weekly(错峰分钟,服务器 CST)
# 离线演练注入口(与 deploy.sh 的 SSH_BIN/SCP_BIN 同一手法):
#   GALLERY_DIR BACKUP_DIR TAR_BIN SQLITE_BIN KEEP_DAILY KEEP_WEEKLY REQUIRED REQUIRE_DB
set -u
G=${GALLERY_DIR:-/opt/gallery}
B=${BACKUP_DIR:-/opt/backups}
MODE=${1:-daily}
D=$(date +%Y%m%d)
TAR=${TAR_BIN:-tar}
SQLITE=${SQLITE_BIN:-sqlite3}
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-2}
REQUIRED=${REQUIRED:-gate_data.json}
REQUIRE_DB=${REQUIRE_DB:-1}

fail() { echo "BACKUP_FAILED mode=$MODE reason=$1" >&2; exit "${2:-1}"; }

[ -d "$G" ] || fail "no-gallery-dir:$G" 1
mkdir -p "$B/daily" "$B/weekly" || fail "cannot-create:$B" 1
# 权威存储缺席 ⇒ 拒绝继续(宁可不轮转也不能用"没有 DB 的档"顶掉昨天的档)。纯 JSON 的老机器可显式 REQUIRE_DB=0。
if [ "$REQUIRE_DB" = 1 ] && [ ! -f "$G/gate_data.db" ]; then
  fail "authoritative-db-missing:$G/gate_data.db (纯 JSON 部署请显式 REQUIRE_DB=0)" 8
fi

rotate() { # $1=子目录 $2=文件中段 $3=保留份数   —— 只在新档上位成功之后调用
  ls -t "$B/$1"/gallery-"$2"-*.tar.gz 2>/dev/null | tail -n "+$(( $3 + 1 ))" | xargs -r rm -f --
}

# WAL 收口必须在**采集清单之前**:sqlite3 的 wal_checkpoint(TRUNCATE) 会把 WAL 并回主库并把 -wal 截断,
# SQLite 在最后一个连接关闭时还会**直接删掉** -wal / -shm(它们本就是临时文件)。
# 先选清单再 checkpoint ⇒ 清单里躺着两个随后就消失的名字,tar 退 2("Cannot stat"),备份被自己搞红。
# (2026-10-17 写这条测试时当场撞出来的,不是理论:夹具里 checkpoint 之后 -wal/-shm 真的没了。)
# 没有 sqlite3 就照旧热拷 db+wal+shm,并在结论行里写明是 hot-copy。
DBMODE=hot-copy
if command -v "$SQLITE" >/dev/null 2>&1 && [ -f "$G/gate_data.db" ]; then
  if "$SQLITE" "$G/gate_data.db" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1; then DBMODE=checkpointed; fi
fi

take() { # $1=子目录 $2=文件中段 $3=保留份数 $4…=要打包的相对路径
  local sub=$1 mid=$2 keep=$3 out tmp rc members list
  shift 3
  out=$B/$sub/gallery-$mid-$D.tar.gz
  tmp=$out.part
  rm -f "$tmp" "$tmp.err"
  # 失败时必须把半截档删掉:留在盘上既会被下一次的 `tar tzf` 混淆,更会吃掉那 2 核小机所剩不多的空间
  # —— 而 ENOSPC 恰恰是最初让 tar 失败的那个原因,不清就是恶性循环。原因已经在 BACKUP_FAILED 里点名了,不需要靠残骸排障。
  bail() { rm -f "$tmp" "$tmp.err"; fail "$1" "${2:-1}"; }

  rc=0
  "$TAR" czf "$tmp" -C "$G" "$@" 2>"$tmp.err" || rc=$?
  # exit 1 = 读的过程中有文件被改(活库上属正常);> 1 才是真失败。但最终结论只由下面的验看决定。
  if [ "$rc" -gt 1 ]; then bail "tar-exit=$rc $(head -c 400 "$tmp.err" | tr '\n' ' ')" 2; fi
  "$TAR" tzf "$tmp" >/dev/null 2>&1 || bail "archive-unreadable(rc=$rc)" 3
  members=$("$TAR" tzf "$tmp" | wc -l)
  [ "$members" -gt 0 ] || bail "archive-empty" 4
  # 必检成员:目录在归档里带尾斜杠(videos/),所以这里按"名字可有尾斜杠"匹配
  "$TAR" tzf "$tmp" | grep -qxE -- "$REQUIRED/?" || bail "archive-missing-required:$REQUIRED" 5
  mv -f "$tmp" "$out" || bail "mv-failed:$out" 6
  rm -f "$tmp.err"
  rotate "$sub" "$mid" "$keep"
  list=$("$TAR" tzf "$out" | sed 's|/.*||' | sort -u | tr '\n' ' ')
  echo "BACKUP_OK mode=$mid bytes=$(wc -c <"$out") members=$members dbmode=$DBMODE kept=$keep top=[$list]"
}

# 只打包存在的项(可选成员缺席不该判失败;必检项由 REQUIRED / REQUIRE_DB 单独钉)
pick() { local f; for f in "$@"; do if [ -e "$G/$f" ]; then printf '%s\n' "$f"; fi; done; }

case "$MODE" in
  daily)
    LIST=$(pick \
      gate_data.db gate_data.db-wal gate_data.db-shm gate_data.json data.js .r2-outbox.json \
      photos music \
      server.js package.json lib scripts src questions \
      index.html admin.html guide.html whiteboard.html music.html agreement.html privacy.html community.html docs.html \
      ADMIN_GUIDE.md AGENTS.md)
    [ -n "$LIST" ] || fail "empty-file-list" 7
    # shellcheck disable=SC2086
    take daily data "$KEEP_DAILY" $LIST
    ;;
  weekly)
    LIST=$(pick videos)
    [ -n "$LIST" ] || fail "empty-file-list:videos" 7
    # shellcheck disable=SC2086
    take weekly videos "$KEEP_WEEKLY" $LIST
    ;;
  *)
    echo "用法: backup-gallery.sh [daily|weekly]" >&2; exit 1;;
esac
