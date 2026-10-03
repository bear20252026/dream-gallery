#!/usr/bin/env python3
# subset-zh-font.py — 重新生成中文剧情字体子集(志莽行书 Zhi Mang Xing,OFL)
#
# 为什么要子集:完整字体 4MB,手机首屏扛不住;只收游戏里真正出现的字。
# 为什么要脚本:2026-09-07 的子集只有 318 个字,后来新写的台词大量缺字,
# 一句话里半行书半微软雅黑(2026-10-03 测试反馈)。以后改台词后跑一次本脚本即可。
# 单测 src/__tests__/zh-font-coverage.test.js 会在缺字时报错,提醒重跑。
#
# 用法(需要 Python 3 + fonttools + brotli:pip install fonttools brotli):
#   python scripts/gen/subset-zh-font.py <完整字体 ZhiMangXing-Regular.ttf 路径>
# 输出:src/styles/fonts/ZhiMangXing-sub.woff2(Vite 构建时加内容哈希,换字表后浏览器立即拿到新版)
import os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_GLOBS = ['src/**/*.js', 'src/**/*.mjs', 'src/**/*.css', 'index.html']
EXCLUDE = re.compile(r'(__tests__|/admin/)')
# 常用标点与符号(不论台词里有没有,都收进来,免得加一句新台词就缺标点)
EXTRA = '，。、；：？！“”‘’（）《》〈〉【】—…·～「」『』﹏０１２３４５６７８９'

def strip_comments(text):
    # 去掉 /* */ 与 // 注释,但保留字符串里的内容(粗略状态机,宁多勿少)
    out, i, n = [], 0, len(text)
    quote = None
    while i < n:
        c = text[i]
        if quote:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(text[i + 1]); i += 2; continue
            if c == quote:
                quote = None
            i += 1; continue
        if c in '\'"`':
            quote = c; out.append(c); i += 1; continue
        if text.startswith('/*', i):
            j = text.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if text.startswith('//', i) and (i == 0 or text[i - 1] != ':'):
            j = text.find('\n', i); i = n if j < 0 else j; continue
        if text.startswith('<!--', i):
            j = text.find('-->', i + 4); i = n if j < 0 else j + 3; continue
        out.append(c); i += 1
    return ''.join(out)

def wanted_chars():
    chars = set(EXTRA)
    for g in SRC_GLOBS:
        for p in glob.glob(os.path.join(ROOT, g), recursive=True):
            rel = os.path.relpath(p, ROOT).replace('\\', '/')
            if EXCLUDE.search(rel):
                continue
            body = strip_comments(open(p, encoding='utf-8').read())
            for ch in body:
                o = ord(ch)
                if 0x3000 <= o <= 0x9FFF or 0xFF00 <= o <= 0xFFEF:
                    chars.add(ch)
    return chars

def main():
    if len(sys.argv) < 2:
        print(__doc__ or 'usage: subset-zh-font.py <ZhiMangXing-Regular.ttf>'); sys.exit(2)
    from fontTools import subset
    from fontTools.ttLib import TTFont
    src = sys.argv[1]
    out = os.path.join(ROOT, 'src', 'styles', 'fonts', 'ZhiMangXing-sub.woff2')
    want = wanted_chars()
    full = TTFont(src)
    cmap = full.getBestCmap()
    have = sorted(c for c in want if ord(c) in cmap)
    missing = sorted(c for c in want if ord(c) not in cmap)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(have) + ' ')
    sub.subset(full)
    subset.save_font(full, out, opts)
    print(f'字体子集:{len(have)} 字 → {out} ({os.path.getsize(out) // 1024} KB)')
    if missing:
        print(f'字体本身没有的 {len(missing)} 个字符(会回退到系统字体):{"".join(missing)}')

if __name__ == '__main__':
    main()
