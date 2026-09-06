# strip-special-ui.py — admin.html 移除特殊模式 UI(2026-09-06 主人定,一次性)
import io, re, sys

p = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery\admin.html"
t = io.open(p, encoding="utf-8").read()

# ① 模式卡:整块换成静态"普通模式"
old_card = """        $('modeCard').innerHTML =
          `全局默认模式:<b style="color:${sc.mode === 'special' ? '#d97706' : '#16a34a'}">${sc.mode === 'special' ? '特殊模式(全展示)' : '普通模式(默认)'}</b>
    <button class="btn-day" onclick="setMode('normal')">切到普通</button>
    <button class="btn-day" onclick="setMode('special')">切到特殊</button>
    <div style="opacity:.6;font-size:12px;margin-top:6px">「特殊访问」按访客单独授予:在「审批」页对应设备上点「授特殊」;访客自己无法申请</div>`;"""
new_card = """        $('modeCard').innerHTML =
          `全局默认模式:<b style="color:#16a34a">普通模式(2026-09-06 起特殊模式已删除)</b>`;"""
if old_card not in t:
    print("mode card block not found"); sys.exit(1)
t = t.replace(old_card, new_card)

# ② setMode 函数整体移除(不再有模式可切)
m = re.search(r"      async function setMode\(mode\) \{.*?\n      \}\n", t, re.S)
if not m:
    print("setMode fn not found"); sys.exit(1)
t = t[: m.start()] + t[m.end():]

io.open(p, "w", encoding="utf-8", newline="").write(t)
print("admin.html: mode card simplified, setMode removed")
