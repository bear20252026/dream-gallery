# retheme-gameshell.py — 任务册/菜单文案跟随 B612 重题(2026-09-06 审计 P4,机制不变)
import io
p = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery\src\core\gameshell-system.js"
t = io.open(p, encoding="utf-8").read()

reps = [
    ("    if (spirits >= 6) ark = '六灵蕴归位';", "    if (spirits >= 6) ark = '六颗星屑归位';"),
    ("    if (spirits < 6) main = '集齐六合灵蕴';", "    if (spirits < 6) main = '收集六颗星屑';"),
    ("    else main = '昆仑已亮，慢慢逛';", "    else main = 'B612 已亮，慢慢逛';"),
    ("      ['灵蕴', p.spirits + ' / 6'],", "      ['星屑', p.spirits + ' / 6'],"),
    ('        <div class="m-title">昆 仑 灵 鉴</div>', '        <div class="m-title">B 6 1 2</div>'),
    ('        <div class="m-sub">藏梦人手札</div>', '        <div class="m-sub">a gallery for unfinished drawings</div>'),
    ("        speaker: '昆仑',", "        speaker: 'B612',"),
    ("'凡人一念，可补天缺。你推开这扇门时，昆仑就亮了。',", "'Welcome to B612 — a gallery for unfinished drawings.',"),
    ("'去拾六合灵蕴罢——天、地、风、火、水、心。集齐了，飞舟自会来接你。',", "'收集六颗星屑罢——天、地、风、火、水、心。集齐了，飞舟自会来接你。',"),
    ("'走近发光的光柱即可拾取灵蕴；登上山巅的飞舟可巡游天穹。',", "'走近发光的光柱即可拾取星屑；登上山巅的飞舟可巡游天穹。',"),
    ("'灵蕴 ' + p.spirits + ' / 6　·　展厅挂画 ' + p.picks + ' / 20　·　飞舟 ' + p.ark,", "'星屑 ' + p.spirits + ' / 6　·　展厅挂画 ' + p.picks + ' / 20　·　飞舟 ' + p.ark,"),
    ('<div class="q-main">◈ 集齐六合灵蕴</div>', '<div class="q-main">◈ 收集六颗星屑</div>'),
    ("'你带走的不只是记忆。昆仑留着你的光。'", "'你带走的不只是记忆。B612 留着你的光。'"),
]
# speaker: '昆仑' 出现两次,逐个替换
n = 0
for a, b in reps:
    c = t.count(a)
    if c == 0:
        print("MISS:", a[:44])
        continue
    t = t.replace(a, b)
    n += c
io.open(p, "w", encoding="utf-8", newline="").write(t)
print("gameshell retheme applied:", n, "replacements")
