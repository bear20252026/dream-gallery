# -*- coding: utf-8 -*-
"""
plan-trace v2: full-fidelity posterized vector trace of the gallery template.
Strategy: quantize the building region into luminance bands, trace EVERY band
as exact polygons (with holes), stack them dark->light -> 1:1 vector copy.
"""
import cv2, json, math
import numpy as np

SRC = r"C:/Users/17296/.workbuddy/clipboard-images/clipboard-2026-09-01T16-12-51-419Z-a429c747.png"
OUT_JSON = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/plan-trace2.json"
OUT_SVG = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/plan-trace2.svg"
OUT_HTML = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/plan-trace2.html"
OUT_CMP = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/plan-trace2-compare.png"

BG = 221.0
MIN_AREA = 35

img = cv2.imread(SRC)
H, W = img.shape[:2]
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.int16)
bgr = img.astype(np.int16)

# ---- building silhouette: anything different from flat bg ----
diff = np.abs(g.astype(np.float32) - BG)
build = (diff > 7).astype(np.uint8)
build = cv2.morphologyEx(build, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
build = cv2.morphologyEx(build, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

# keep only significant components
n, lab, stats, cent = cv2.connectedComponentsWithStats(build, 8)
build = np.zeros_like(build)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= 300:
        build[lab == i] = 1

print("building px:", int(build.sum()), " bbox:",
      cv2.boundingRect(build))

# ---- histogram inside building to pick band thresholds ----
vals = g[build > 0]
hist, edges = np.histogram(vals, bins=256, range=(0, 256))
for lo in range(0, 256, 20):
    s = hist[lo:lo+20].sum()
    if s:
        print(f"  g[{lo:3d}-{lo+19:3d}] {s}")

# ---- band definitions (draw order: base first, overlays on top) ----
# (name, mask_fn, color sampled later)
def mask_of(pred):
    m = (build & pred).astype(np.uint8)
    return m

BRIGHT_T = 232   # pure white lights / core
bands = [
    ("dark3", mask_of(g < 90)),
    ("dark2", mask_of((g >= 90) & (g < 130))),
    ("dark1", mask_of((g >= 130) & (g < 165))),
    ("mid",   mask_of((g >= 165) & (g < 196))),
    ("light", mask_of((g >= 196) & (g < BRIGHT_T))),
    ("bright", mask_of(g >= BRIGHT_T)),
]

def band_color(m):
    sel = m > 0
    if sel.sum() < 10:
        return (200, 200, 200)
    med = np.percentile(bgr[sel], 60, axis=0)  # BGR, 60th pct brightens shaded bands
    r, gg, b = int(med[2]), int(med[1]), int(med[0])
    return (r, gg, b)

def trace(m, min_area=MIN_AREA):
    """trace mask -> list of polygons (each = list of [x,y]) after cleanup"""
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in cnts:
        if cv2.contourArea(c) < min_area:
            continue
        ap = cv2.approxPolyDP(c, 1.2, True)
        pts = chaikin(ap[:, 0, :].astype(np.float64), iters=2)
        polys.append([[round(float(p[0]), 1), round(float(p[1]), 1)] for p in pts])
    return polys

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

def path_d(polys):
    ds = []
    for p in polys:
        d = "M" + " L".join(f"{x},{y}" for x, y in p) + " Z"
        ds.append(d)
    return " ".join(ds)

# ---- raster preview: pixel-exact posterization ----
canvas = np.full((H, W, 3), 221, np.uint8)
canvas[build > 0] = band_color(mask_of(g >= 0))  # base = all building
for name, m in bands:
    col = band_color(m)
    canvas[m > 0] = col[::-1] if False else col  # band_color returns RGB; cv2 wants BGR
# fix: redo properly
canvas = np.full((H, W, 3), 221, np.uint8)
def bgr_of(m):
    sel = m > 0
    if sel.sum() < 10:
        return (200, 200, 200)[::-1]
    med = np.median(bgr[sel], axis=0)
    return tuple(int(v) for v in med)  # already BGR

canvas[build > 0] = bgr_of(mask_of(g >= 0))
band_data = []
for name, m in bands:
    col_bgr = bgr_of(m)
    canvas[m > 0] = col_bgr
    polys = trace(m)
    col_rgb = (int(col_bgr[2]), int(col_bgr[1]), int(col_bgr[0]))
    band_data.append({
        "name": name, "threshold": name, "color": "#%02x%02x%02x" % col_rgb,
        "px": int(m.sum()), "polys": polys, "n": len(polys),
    })
    print(f"band {name:7s} px={int(m.sum()):7d} polys={len(polys):4d} color=#{'%02x%02x%02x' % col_rgb}")

# ---- outer silhouette (largest contour) ----
cnts, _ = cv2.findContours(build, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
outer = max(cnts, key=cv2.contourArea)
ap = cv2.approxPolyDP(outer, 1.5, True)
sil = chaikin(ap[:, 0, :].astype(np.float64), iters=2)
sil_json = [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in sil]
print("silhouette pts:", len(sil_json), "area:", int(cv2.contourArea(outer)))

# ---- JSON ----
x, y, w, h = cv2.boundingRect(build)
data = {
    "imgSize": [W, H],
    "bgGray": BG,
    "buildingBBox": [int(x), int(y), int(w), int(h)],
    "silhouette": sil_json,
    "bands": [{k: v for k, v in b.items() if k != "polys"} | {"polys": b["polys"]} for b in band_data],
}
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)

# ---- SVG: draw base silhouette, then bands dark->light ----
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
parts.append(f'<rect width="{W}" height="{H}" fill="#dddddd"/>')
base_rgb = band_color(mask_of(g >= 0))
parts.append(f'<path d="{path_d([sil_json])}" fill="#%02x%02x%02x"/>' % base_rgb)
for b in band_data:
    if not b["polys"]:
        continue
    parts.append(f'<path d="{path_d(b["polys"])}" fill="{b["color"]}" fill-rule="evenodd"/>')
# bright glow filter on top of bright band
parts.append('</svg>')
svg = "\n".join(parts)
with open(OUT_SVG, "w", encoding="utf-8") as f:
    f.write(svg)

html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>plan-trace v2</title>
<style>body{{margin:0;background:#2a2a2e;display:flex;align-items:center;justify-content:center;min-height:100vh}}
svg{{max-width:96vw;max-height:96vh;box-shadow:0 8px 40px rgba(0,0,0,.5);background:#ddd}}</style>
</head><body>{svg}</body></html>"""
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

# ---- compare image ----
cmp_img = np.full((H, W * 2 + 8, 3), 40, np.uint8)
cmp_img[:, :W] = img
cmp_img[:, W + 8:] = canvas
cv2.imwrite(OUT_CMP, cmp_img)
print("saved all artifacts")
