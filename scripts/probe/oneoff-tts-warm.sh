#!/bin/bash
# 一次性:把全部剧情台词煮进 tts1 新键缓存(避开 batch 队列 120 上限:40条/批,批间45s)
cd /opt/gallery
echo "cache before: $(ls .tts-cache | wc -l)"
for f in /tmp/warm-chunk-*.json; do
  echo "--- POST $f ---"
  curl -s -m 60 -X POST http://127.0.0.1:3000/api/tts/batch -H 'Content-Type: application/json' -d @"$f"
  echo
  sleep 45
done
echo "cache after last POST: $(ls .tts-cache | wc -l)"
echo "等 150s 让队列慢慢煮完…"
sleep 150
echo "cache final: $(ls .tts-cache | wc -l)"
rm -f /tmp/warm-chunk-*.json /tmp/tts-warm.sh
echo done
