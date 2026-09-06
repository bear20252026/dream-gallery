# retheme-all.py — 全量清除玩家可见的旧主题文案(2026-09-06 主人定 1~5 项)
# 策略:只替换字符串字面量内的玩家可见文本;代码注释不动(不影响玩家)。
import io, os, re

ROOT = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery"

# 全局词替换(玩家可见字符串内)
GLOBAL = [
    ("昆仑灵鉴", "B612"),
    ("梦幻画廊", "B612"),
    ("六合灵蕴", "六颗星屑"),
    ("六合藏梦人", "B612 旅人"),
    ("灵蕴", "星屑"),
    ("昆仑之灵", "B612 之灵"),
    ("昆仑回声壁", "一念之墙"),
    ("心象共鸣", "心象共鸣"),  # 保留(已是 B612 语境)
    ("昆仑巅", "高原之巅"),
    ("昆仑罗盘", "罗盘"),
]

# 逐文件精确替换( longer patterns first to avoid partial hits )
FILE_REPLACEMENTS = {
    "src/gate/settings/sky-progress.js": [
        ("昆仑没有日夜", "B612 没有日夜"),
        ("昆仑的多亮一盏灯", "B612 的多亮一盏灯"),
        ("都在昆仑多亮", "都在 B612 多亮"),
        ("山记得你的每一步", "沙漠记得你的每一步"),
        ("昆仑替你记得", "B612 替你记得"),
        ("灵蕴", "星屑"),
        ("昆仑", "B612"),
        ("六合", "六颗"),
    ],
    "src/kunlun/spirits.js": [
        ("灵蕴", "星屑"),
        ("昆仑", "B612"),
        ("六合", "六颗"),
    ],
    "src/gate/quizgate.js": [
        ("昆仑", "B612"),
        ("灵蕴", "星屑"),
    ],
    "src/kunlun/finale.js": [
        ("灵蕴", "星屑"),
        ("昆仑", "B612"),
        ("六合", "六颗"),
    ],
    "src/gallery/paintings.js": [
        ("昆仑替你记得", "B612 替你记得"),
        ("昆仑记忆回声", "B612 记忆回声"),
        ("昆仑", "B612"),
    ],
    "src/scene/desert/atmosphere.js": [
        ("昆仑", "远方高地"),
    ],
    "src/scene/minimap.js": [
        ("昆仑", "B612"),
    ],
    "src/gate/upload.js": [
        ("昆仑", "B612"),
    ],
    "src/scene/media/audio-manager.js": [
        ("昆仑没有日夜。你来了，天就亮了。", "B612 在这里等你。你来了，星星就亮了。"),
    ],
    "src/kunlun/eternal.js": [
        ("昆仑", "B612"),
        ("灵蕴", "星屑"),
    ],
    "src/gate/settings.js": [
        ("昆仑", "B612"),
        ("灵蕴", "星屑"),
    ],
    "src/kunlun/ark.js": [
        ("灵蕴", "星屑"),
        ("昆仑", "B612"),
    ],
    "src/gate/settings/wish-page.js": [
        ("昆仑", "B612"),
    ],
    "src/gate/settings/chat-room.js": [
        ("昆仑", "B612"),
    ],
    "src/core/gameshell-dialog.js": [
        ("昆仑", "B612"),
    ],
    "src/core/scene-manager.js": [
        ("昆仑", "B612"),
    ],
    "src/scene/player.js": [
        ("昆仑", "B612"),
    ],
    "src/kunlun/windchime.js": [
        ("昆仑", "B612"),
    ],
    "src/kunlun/letgo.js": [
        ("昆仑", "B612"),
        ("灵蕴", "星屑"),
    ],
    "src/kunlun/peaks.js": [
        ("昆仑", "远方山巅"),
    ],
    "src/kunlun/resetview.js": [
        ("昆仑", "B612"),
    ],
    "src/kunlun/freeflight-physics.js": [
        ("昆仑", "远方"),
    ],
    "src/gate/settings/spirit-page.js": [
        ("灵蕴", "星屑"),
        ("昆仑", "B612"),
    ],
    "src/gate/settings/chat-room.js": [
        ("昆仑", "B612"),
    ],
    "src/gallery/links.js": [
        ("昆仑", "B612"),
    ],
}

total = 0
for rel, reps in FILE_REPLACEMENTS.items():
    fp = os.path.join(ROOT, rel)
    if not os.path.exists(fp):
        print("SKIP(不存在):", rel)
        continue
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
        print(f"  {rel}: {n} 处")
    else:
        print(f"  {rel}: 0")

print(f"\n总计替换: {total} 处")
