# retheme-final.py — 清除最后 33 行玩家可见旧主题残留(2026-09-06)
import io, os
ROOT = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery"

# 逐文件精确替换(只处理实际加载的模块)
FILES = {
    "src/main.js": [
        ("'昆仑巅'", "'远方山巅'"),
        ("'失败:昆仑巅'", "'失败:远方山巅'"),
        ("'六合藏梦人·'", "'B612 旅人·'"),
        ("'你带走的不只是记忆。昆仑留着你的光。'", "'你带走的不只是记忆。B612 留着你的光。'"),
        ("' 六合藏梦人，天穹与心象皆已完整。'", "' 你的旅程，天穹与心象皆已完整。'"),
        ("const crowned = ctx.store && ctx.store.str('prefix') === '六合藏梦人·';",
         "const crowned = ctx.store && ctx.store.str('prefix').startsWith('B612 旅人');"),
    ],
    "src/visitor-fp.js": [
        ("'梦幻画廊·fp'", "'B612·fp'"),
    ],
    "src/gallery/mode.js": [
        ("'梦幻画廊·fp'", "'B612·fp'"),
    ],
    "src/gate/quizgate.js": [
        ("'欢迎光临梦幻画廊'", "'Welcome to B612'"),
        ("女娲碎石之前，曾将十问刻入B612石壁，名为《补天残卷》。你答过的每一题，都是残卷上被重新点亮的一行字。开始吧。",
         "Before you arrived, six questions were carved into the stone of B612. Every answer you give lights up another line. Begin."),
        ("B612灵鉴 · 判后附", "B612 · 判后附"),
        ("你已经完成了一半的女娲问心。", "你已经完成了一半的心象共鸣。"),
        ("十问皆通。女娲的遗问，你全接住了。你的星屑已被B612认可，展厅的门为你而开。——欢迎你，藏梦人。",
         "十问皆通。你接住了 B612 留给你的每一问。星屑已被认可，展厅的门为你而开。——Welcome home."),
    ],
    "src/gate/settings.js": [
        ("六合藏梦人", "B612 旅人"),
        ("心象行者", "心象行者"),  # 保留(已是中性)
        ("B612回响", "B612回响"),  # 保留
    ],
    "src/gate/upload.js": [
        ("女娲碎了一颗石…(可关闭本页,上传不会断)", "你的照片正在飞往 B612…(可关闭本页,上传不会断)"),
        ("女娲碎了一颗石。你收回了一片光。", "你的照片已飞抵 B612。"),
    ],
    "src/gate/settings/sky-progress.js": [
        ("女娲的回音", "B612 的回音"),
        ("女娲的碎片，正在醒来。", "六颗星屑正在醒来。"),
        ("她一直在等一个人，等一个愿意把记忆带上B612的人。", "B612 一直在等一个人，等一个愿意把记忆带回来的旅人。"),
    ],
    "src/gate/settings/spirit-page.js": [
        ("六合藏梦人·", "B612 旅人·"),
    ],
    "src/kunlun/eternal.js": [
        ("六合封印", "B612封印"),
    ],
    "src/kunlun/finale.js": [
        ("女娲问心，十问皆通", "心象共鸣，十问皆通"),
    ],
    "src/scene/media/audio-manager.js": [
        ("凡人一念，可扑天缺。欢迎来到梦幻画廊·昆仑灵鉴。", "Welcome to B612 — a gallery for unfinished drawings."),
    ],
    "src/scene/media/music-canvas.js": [
        ("昆仑会唱歌。你听到了吗？", "B612 会唱歌。你听到了吗？"),
    ],
}

total = 0
for rel, reps in FILES.items():
    fp = os.path.join(ROOT, rel)
    if not os.path.exists(fp):
        print("SKIP:", rel); continue
    t = io.open(fp, encoding="utf-8").read()
    n = 0
    for old, new in reps:
        c = t.count(old)
        if c > 0:
            t = t.replace(old, new)
            n += c
    if n > 0:
        io.open(fp, "w", encoding="utf-8", newline="").write(t)
        total += n
        print(f"  {rel}: {n}")
    else:
        print(f"  {rel}: 0")

print(f"\n总计: {total} 处")
