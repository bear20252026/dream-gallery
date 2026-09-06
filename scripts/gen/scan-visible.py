# scan-visible.py — 扫描玩家可见的旧主题字符串残留(排除纯注释行)
import io, os, re
ROOT = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery"
PAT = re.compile(r'昆仑|灵鉴|梦幻画廊|女娲|六合')
results = []
for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, 'src')):
    for fn in filenames:
        if not fn.endswith('.js'):
            continue
        fp = os.path.join(dirpath, fn)
        rel = os.path.relpath(fp, ROOT)
        for i, line in enumerate(io.open(fp, encoding='utf-8'), 1):
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
                continue
            if PAT.search(line):
                results.append(f"{rel}:{i}: {stripped[:120]}")
# index.html
fp = os.path.join(ROOT, 'index.html')
for i, line in enumerate(io.open(fp, encoding='utf-8'), 1):
    stripped = line.strip()
    if stripped.startswith('//') or stripped.startswith('<!--'):
        continue
    if PAT.search(line):
        results.append(f"index.html:{i}: {stripped[:120]}")

print(f"玩家可见残留: {len(results)} 行")
for r in results[:30]:
    print(r)
