# -*- coding: utf-8 -*-
"""
plan-trace v3: 11-band fine posterized vector trace.
More luminance bands -> smooth gradients preserved; smaller MIN_AREA and
tighter approxPolyDP -> thin dark frames and central flower detail survive.
"""
import cv2, json
import numpy as np

SRC = r"C:/Users/17296/.workbuddy/clipboard-images/clipboard-2026-09-01T16-12-51-419Z-a429c747.png"
ART = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/"
OUT_JSON = ART + "plan-trace3.json"
OUT_SVG = ART + "plan-trace3.svg"
OUT_HTML = ART + "plan-trace3.html"
OUT_CMP = ART + "plan-trace3-compare.png"

BG = 221.0
MIN_AREA = 22
EPS = 1.0

img = cv2.imread(SRC)
H, W = img.shape[:2]
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.int16)
bgr = img.astype(np.int16)

diff = np.abs(g.astype(np.float32) - BG)
build = (diff > 6).astype(np.uint8)
build = cv2.morphologyEx(build, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, stats, cent = cv2.connectedComponentsWithStats(build, 8)
build = np.zeros_like(build)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= 300:
        build[lab == i] = 1

# ---- 11 fine bands tuned to the histogram ----
THS = [100, 125, 145, 165, 185, 205, 222, 232, 242, 252]
edges = [-1] + THS + [256]
bands = []
for i in range(len(edges) - 1):
    lo, hi = edges[i], edges[i + 1]
    name = f"b{i:02d}_{lo}_{hi}"
    m = ((build > 0) & (g > lo) & (g <= hi)).astype(np.uint8)
    bands.append((name, m))

def bgr_of(m, pct=55):
    sel = m > 0
    if sel.sum() < 10:
        return (200, 200, 200)
    med = np.percentile(bgr[sel], pct, axis=0)  # BGR
    return tuple(int(v) for v in med)

def chaikin(pts, iters=2):
    pts = np.asarray(pts, dtype=np.float64)
    for _ in range(iters):
        n = len(pts)
        q = 0.75 * pts + 0.25 * np.roll(pts, -1, axis=0)
        r = 0.25 * pts + 0.75 * np.roll(pts, -1, axis=0)
        out = np.empty((2 * n, 2), dtype=np.float64)
        out[0::2] = q
        out[1::2] = r
        pts = out
    return pts

def trace(m):
    """raw pixel contours — NO approxPolyDP, NO Chaikin smoothing.
    Smoothing cuts corners so adjacent bands' polygons misalign, creating
    gaps/overlaps in SVG. Raw contours of disjoint masks tile pixel-exactly."""
    m = m.copy()
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in cnts:
        if cv2.contourArea(c) < MIN_AREA:
            continue
        pts = c[:, 0, :].astype(np.float64)
        polys.append([[round(float(p[0]), 1), round(float(p[1]), 1)] for p in pts])
    return polys

# ---- raster preview (pixel-exact posterization) ----
canvas = np.full((H, W, 3), 221, np.uint8)
band_data = []
total_polys = 0
for name, m in bands:
    col_bgr = bgr_of(m)
    canvas[m > 0] = col_bgr
    polys = trace(m)
    col_rgb = (col_bgr[2], col_bgr[1], col_bgr[0])
    band_data.append({
        "name": name, "color": "#%02x%02x%02x" % col_rgb,
        "px": int(m.sum()), "n": len(polys), "polys": polys,
    })
    total_polys += len(polys)
    print(f"band {name:14s} px={int(m.sum()):7d} polys={len(polys):4d} #{'%02x%02x%02x' % col_rgb}")
print("total polys:", total_polys)

# ---- outer silhouette (raw, same policy as bands) ----
cnts, _ = cv2.findContours(build, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
outer = max(cnts, key=cv2.contourArea)
sil = outer[:, 0, :].astype(np.float64)
sil_json = [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in sil]

x, y, w, h = cv2.boundingRect(build)
data = {
    "imgSize": [W, H], "bgGray": BG,
    "buildingBBox": [int(x), int(y), int(w), int(h)],
    "silhouette": sil_json,
    "bands": band_data,
}
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)

# ---- SVG ----
base_col = bgr_of(((build > 0) & (g > 185) & (g <= 232)).astype(np.uint8))
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
parts.append(f'<rect width="{W}" height="{H}" fill="#dddddd"/>')
parts.append('<path d="%s" fill="#%02x%02x%02x"/>' % (
    "M" + " L".join(f"{px},{py}" for px, py in sil_json) + " Z",
    base_col[2], base_col[1], base_col[0]))
for b in band_data:
    if not b["polys"]:
        continue
    d = " ".join("M" + " L".join(f"{px},{py}" for px, py in p) + " Z" for p in b["polys"])
    parts.append(f'<path d="{d}" fill="{b["color"]}"/>')
parts.append('</svg>')
svg = "\n".join(parts)
with open(OUT_SVG, "w", encoding="utf-8") as f:
    f.write(svg)

html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>plan-trace v3</title>
<style>body{{margin:0;background:#2a2a2e;display:flex;align-items:center;justify-content:center;min-height:100vh}}
svg{{max-width:96vw;max-height:96vh;box-shadow:0 8px 40px rgba(0,0,0,.5);background:#ddd}}</style>
</head><body>{svg}</body></html>"""
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

cmp_img = np.full((H, W * 2 + 8, 3), 40, np.uint8)
cmp_img[:, :W] = img
cmp_img[:, W + 8:] = canvas
cv2.imwrite(OUT_CMP, cmp_img)
print("saved v3 artifacts")
