# -*- coding: utf-8 -*-
"""
trace_rose.py — 从玫瑰模型 OBJ 提取平面轮廓(几何级描摹,比图片描摹更准)
流程: 解析 OBJ → 光栅化脚印+高度图 → 按高度分三档切片 → cv2 轮廓 → 米制矢量
输出: rose-plan.json + rose-trace-preview.png + rose-trace-preview.svg
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
import cv2

OBJ = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/rose-model3.obj"
ART = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/"
TARGET_DIAMETER = 42.0  # 米,建筑最大平面尺寸(可调)

# ---------- 解析 OBJ ----------
verts, tris = [], []
with open(OBJ, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith('v '):
            p = line.split()
            verts.append([float(p[1]), float(p[2]), float(p[3])])
        elif line.startswith('f '):
            idx = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
            for i in range(1, len(idx) - 1):
                tris.append([idx[0], idx[i], idx[i + 1]])
V = np.array(verts); T = np.array(tris)
print(f'verts={len(V)} tris={len(T)}')

# OBJ 保持 FBX 的 Y-up: 平面 (x, z)=(V.x, V.z), 高度 h=V.y
xs, zs, hs = V[:, 0], V[:, 2], V[:, 1]
minx, maxx = xs.min(), xs.max()
minz, maxz = zs.min(), zs.max()
hmin, hmax = hs.min(), hs.max()
print(f'plan bbox: {maxx-minx:.3f} x {maxz-minz:.3f} m, height {hmin:.3f}..{hmax:.3f}')

SCALE_M = max(maxx - minx, maxz - maxz)      # 模型最大平面尺寸(米)
S = TARGET_DIAMETER / SCALE_M                # → 建筑米制缩放
PX = 1700 / SCALE_M                          # 光栅分辨率 px/m
Wpx = int(np.ceil((maxx - minx) * PX)) + 2
Hpx = int(np.ceil((maxz - minz) * PX)) + 2

def to_px(x, z):
    return (x - minx) * PX + 1, (z - minz) * PX + 1

# ---------- 光栅化: 脚印 + 高度图(按 max-h 升序画,高处覆盖低处) ----------
tv = V[T]  # (n,3,3)
tri_h = tv[:, :, 1].max(axis=1)
order = np.argsort(tri_h)
foot = Image.new('L', (Wpx, Hpx), 0)
hmap = Image.new('L', (Wpx, Hpx), 0)
dfd, dhd = ImageDraw.Draw(foot), ImageDraw.Draw(hmap)
hnorm = 255.0 / max(1e-9, (hmax - hmin))
for ti in order:
    a, b, c = tv[ti]
    pa = to_px(a[0], a[2]); pb = to_px(b[0], b[2]); pc = to_px(c[0], c[2])
    poly = [pa, pb, pc]
    dfd.polygon(poly, fill=255)
    g = int(max(0, min(255, (tri_h[ti] - hmin) * hnorm)))
    if g > 8:
        dhd.polygon(poly, fill=g)
foot_np = np.array(foot)
hmap_np = np.array(hmap).astype(np.float32) / hnorm + hmin  # 反归一(脚印外为 hmin)
hmap_np[foot_np == 0] = hmin
print('footprint px:', int((foot_np > 0).sum()))

# ---------- 等高线切墙线 ----------
# 模型是实心阶梯塔:取各高度阈值的边界闭合线 = 各档墙的走线
# 阈值 T_i 的墙顶高 = T_{i+1}(阶梯),最内/最高档墙顶 = 1.0
zmax_eff = np.percentile(hmap_np[foot_np > 0], 99.5)
rel = (hmap_np - hmin) / max(1e-9, zmax_eff - hmin)
TIERS = [0.12, 0.38, 0.72]  # 相对高度阈值(从外到内)
def line_contours(mask, eps_m=0.10):
    m = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hier is None:
        return out
    for i, c in enumerate(cnts):
        if cv2.contourArea(c) < 350:
            continue
        pts = c[:, 0, :].astype(np.float64)
        mx = [(px - 1) / PX + minx - (minx + maxx) / 2 for px, py in pts]
        mz = [(py - 1) / PX + minz - (minz + maxz) / 2 for px, py in pts]
        poly = [[a * S, b * S] for a, b in zip(mx, mz)]
        arr = np.array(poly, np.float32).reshape(-1, 1, 2)
        arr = cv2.approxPolyDP(arr, eps_m, True)
        poly = [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in arr[:, 0, :]]
        out.append({'pts': poly, 'hole': bool(hier[0][i][3] != -1)})
    return out

data = {
    'meta': {
        'source': 'rose-model3 (20260902053436_0a2efb57.fbx 几何等高线描摹)',
        'diameter': TARGET_DIAMETER,
        'scaleModelToM': round(S, 3),
        'tiers': TIERS,
    },
    'silhouette': None,
    'rings': [],
}
foot_m = (foot_np > 0).astype(np.uint8) * 255
sil_all = line_contours(foot_m, 0.15)
sil_all.sort(key=lambda c: -len(c['pts']))
data['silhouette'] = sil_all[0]['pts']
print('silhouette pts:', len(data['silhouette']))
for i, t in enumerate(TIERS):
    m = ((rel >= t) & (foot_np > 0)).astype(np.uint8) * 255
    cs = line_contours(m)
    cs.sort(key=lambda c: -len(c['pts']))
    hFrac = TIERS[i + 1] if i + 1 < len(TIERS) else 1.0
    data['rings'].append({'level': f't{i}', 'threshold': t, 'hFrac': hFrac,
                          'contours': [c['pts'] for c in cs],
                          'holes': [c['pts'] for c in cs if c['hole']]})
    print(f'tier t{i} (t={t}, wallTop={hFrac}): {len(cs)} contours, pts {sum(len(c["pts"]) for c in cs)}')

with open(ART + 'rose-plan.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

# ---------- 预览 SVG + PNG(墙线描线版) ----------
def to_px_m(mx, mz):
    """建筑米制坐标 → 预览像素"""
    return int((mx + TARGET_DIAMETER / 2) / TARGET_DIAMETER * 840), int((mz + TARGET_DIAMETER / 2) / TARGET_DIAMETER * 840)

def path_d(polys):
    return ' '.join('M' + ' L'.join(f'{p[0]},{p[1]}' for p in poly) + ' Z' for poly in polys)

parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-TARGET_DIAMETER/2} {-TARGET_DIAMETER/2} {TARGET_DIAMETER} {TARGET_DIAMETER}" width="840" height="840" style="background:#e8e2d8">']
parts.append(f'<path d="{path_d([data["silhouette"]])}" fill="#cfc8bc"/>')
parts.append(f'<path d="{path_d([data["silhouette"]])}" fill="none" stroke="#8a8378" stroke-width="0.3"/>')
strokes = ['#a89f90', '#7d7568', '#4c463d']
img = Image.new('RGB', (840, 840), '#e8e2d8')
d = ImageDraw.Draw(img)
dsil = [to_px_m(x, z) for x, z in data['silhouette']]
d.polygon(dsil, fill='#cfc8bc', outline='#8a8378')
for i, r in enumerate(data['rings']):
    st = strokes[i % len(strokes)]
    dsvg = ' '.join('M' + ' L'.join(f'{p[0]},{p[1]}' for p in poly) + ' Z' for poly in r['contours'])
    parts.append(f'<path d="{dsvg}" fill="none" stroke="{st}" stroke-width="0.35"/>')
    for poly in r['contours']:
        d.line([to_px_m(x, z) for x, z in poly] + [to_px_m(*poly[0])], fill=st, width=2)
parts.append('</svg>')
with open(ART + 'rose-trace-preview.svg', 'w', encoding='utf-8') as f:
    f.write('\n'.join(parts))
img.save(ART + 'rose-trace-preview.png')
print('saved rose-plan.json / rose-trace-preview.svg / rose-trace-preview.png')
