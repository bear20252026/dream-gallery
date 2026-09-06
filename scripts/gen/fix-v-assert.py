# fix-v-assert.py — test.js 的 V 断言放宽为"允许为空"(2026-09-06 非大屏视频退役)
import io
p = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery\scripts\test\test.js"
t = io.open(p, encoding="utf-8").read()
old = "ok(Array.isArray(V) && V.length > 0, `视频列表 V 非空 (${V.length} 个)`);"
new = "ok(Array.isArray(V), `视频列表 V 为数组(2026-09-06 非大屏视频退役,允许为空,当前 ${V.length} 个)`);"
if old not in t:
    print("assertion not found"); sys.exit(1)
io.open(p, "w", encoding="utf-8", newline="").write(t.replace(old, new))
print("test.js V assertion updated")
