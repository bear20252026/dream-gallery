#!/bin/bash
# backup-gallery.sh — 梦幻画廊数据备份(2026-07-28 主人定)
# daily  : gate_data.json(访客数据库)+ photos + music + 全部代码文本 → /opt/backups/daily/(留 14 份)
# weekly : videos(户外大屏/访客视频)→ /opt/backups/weekly/(留 2 份;大屏另有 R2+本地原码率双备份)
# 调度(cron): 17 3 * * * daily / 23 4 * * 0 weekly(错峰分钟,服务器 CST)
set -e
G=/opt/gallery
B=/opt/backups
MODE="${1:-daily}"
D=$(date +%Y%m%d)
mkdir -p "$B/daily" "$B/weekly"

case "$MODE" in
  daily)
    tar czf "$B/daily/gallery-data-$D.tar.gz" -C "$G" \
      gate_data.json photos music server.js package.json index.html admin.html guide.html \
      whiteboard.html music.html agreement.html privacy.html community.html docs.html \
      lib src questions ADMIN_GUIDE.md AGENTS.md 2>/dev/null || true
    ls -t "$B/daily"/gallery-data-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
    ;;
  weekly)
    tar czf "$B/weekly/gallery-videos-$D.tar.gz" -C "$G" videos
    ls -t "$B/weekly"/gallery-videos-*.tar.gz 2>/dev/null | tail -n +3 | xargs -r rm -f
    ;;
  *)
    echo "用法: backup-gallery.sh [daily|weekly]" >&2; exit 1;;
esac
echo "backup $MODE done: $(ls -lh "$B/$MODE/"*"$D"*.tar.gz | awk '{print $5, $9}')"
