# -*- coding: utf-8 -*-
"""
plan-trace v4: SEMANTIC classification with fixed colors.
Classes (not photo colors — fixed palette for the 3D build):
  lights   : g >= 232  -> pure emissive white  (crescent bands + central flower lamp)
  ceiling  : 185 <= g < 232 -> fixed warm cream (main ceiling surface)
  bevel    : 165 <= g < 185 -> fixed darker cream (sloped/bevel surfaces)
  groove   : g < 165    -> fixed grey (deep grooves / dark frames)
Raw pixel contours only (no smoothing) — learned from the SVG-mess lesson.
"""
import cv2, json
import numpy as np

SRC = r"C:/Users/17296/.workbuddy/clipboard-images/clipboard-2026-09-01T16-12-51-419Z-a429c747.png"
ART = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/"
OUT_JSON = ART + "plan-trace4-sem.json"
OUT_SVG = ART + "plan-trace4-sem.svg"
OUT_HTML = ART + "plan-trace4-sem.html"
OUT_CMP = ART + "plan-trace4-sem-compare.png"

BG = 221.0
MIN_AREA = 22

# fixed semantic palette (RGB hex)
PALETTE = {
    "lights":  "#ffffff",
    "ceiling": "#d9d3d0",
    "bevel":   "#bdb7b4",
    "groove":  "#8f8d8c",
}

img = cv2.imread(SRC)
H, W = img.shape[:2]
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.int16)

diff = np.abs(g.astype(np.float32) - BG)
build = (diff > 6).astype(np.uint8)
build = cv2.morphologyEx(build, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, stats, cent = cv2.connectedComponentsWithStats(build, 8)
build = np.zeros_like(build)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= 300:
        build[lab == i] = 1

def trace(m):
    """CCOMP trace with holes: returns list of groups [outer, hole1, hole2...].
    Rendered with fill-rule=evenodd so each polygon group covers EXACTLY its
    mask region (external-only contours filled the holes -> grey ink-wash bug)."""
    cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return []
    hier = hier[0]
    groups = []
    for i, c in enumerate(cnts):
        if hier[i][3] != -1:
            continue  # hole — attached to its parent group below
        if cv2.contourArea(c) < MIN_AREA:
            continue
        grp = [[[round(float(p[0]), 1), round(float(p[1]), 1)]
                for p in c[:, 0, :].astype(np.float64)]]
        for j, hc in enumerate(cnts):
            if hier[j][3] == i and cv2.contourArea(hc) >= MIN_AREA:
                grp.append([[round(float(p[0]), 1), round(float(p[1]), 1)]
                            for p in hc[:, 0, :].astype(np.float64)])
        groups.append(grp)
    return groups

SEM = [
    ("groove",  (build > 0) & (g < 165)),
    ("bevel",   (build > 0) & (g >= 165) & (g < 185)),
    ("ceiling", (build > 0) & (g >= 185) & (g < 232)),
    ("lights",  (build > 0) & (g >= 232)),
]

# ---- refine lights: rim highlights are NOT lights ----
# True lights sit INSIDE groove recesses: each light component is fully
# enclosed by dark frames and never touches the building silhouette edge.
# NOTE: build has internal holes (midtone ceiling pixels), so the edge band
# must come from a SOLID silhouette (outer contour filled), not from build.
cnts0, _ = cv2.findContours(build, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
solid = np.zeros_like(build)
cv2.fillPoly(solid, [max(cnts0, key=cv2.contourArea)], 1)
edge_band = (solid & ~cv2.erode(solid, np.ones((11, 11), np.uint8))).astype(np.uint8)
lm = SEM[3][1].astype(np.uint8)
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(lm, 8)
lights_clean = np.zeros_like(lm)
rim_hl = np.zeros_like(lm)
rm_n = 0
for i in range(1, n2):
    comp = (lab2 == i)
    if (comp & (edge_band > 0)).any():
        rim_hl[comp] = 1  # surface highlight, not a light
        rm_n += 1
    elif st2[i, cv2.CC_STAT_AREA] >= 40:
        lights_clean[comp] = 1
print(f"lights refine: removed {rm_n} rim-highlight comps "
      f"({int(rim_hl.sum())} px), lights {int(lm.sum())} -> {int(lights_clean.sum())} px")
SEM[3] = ("lights", lights_clean > 0)
SEM[2] = ("ceiling", SEM[2][1] | (rim_hl > 0))  # highlights fall back to ceiling

canvas = np.full((H, W, 3), 221, np.uint8)
layers = {}
for name, mask in SEM:
    mask = mask.astype(np.uint8)
    hexcol = PALETTE[name]
    rgb = tuple(int(hexcol[i:i+2], 16) for i in (1, 3, 5))
    canvas[mask > 0] = rgb[::-1]
    polys = trace(mask)
    layers[name] = {"color": hexcol, "px": int(mask.sum()), "polys": polys, "n": len(polys)}
    print(f"{name:8s} px={int(mask.sum()):7d} polys={len(polys):4d} {hexcol}")

# ---- verification: per-group layer (fill outer, unfill holes), OR together ----
print("--- evenodd verification (per-group layers, OR) ---")
for name, mask in SEM:
    mask = mask.astype(np.uint8)
    sim = np.zeros((H, W), np.uint8)
    for grp in layers[name]["polys"]:
        layer = np.zeros((H, W), np.uint8)
        cv2.fillPoly(layer, [np.array(grp[0], np.int32)], 1)
        if len(grp) > 1:
            cv2.fillPoly(layer, [np.array(r, np.int32) for r in grp[1:]], 0)
        sim |= layer
    mism = int(np.logical_xor(sim > 0, mask > 0).sum())
    tot = int(mask.sum())
    print(f"{name:8s} mask={tot:7d} mismatch={mism:6d} ({100*mism/max(tot,1):.2f}% of class)")

# ---- outer silhouette (raw) ----
cnts, _ = cv2.findContours(build, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
outer = max(cnts, key=cv2.contourArea)
sil = [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in outer[:, 0, :].astype(np.float64)]

x, y, w, h = cv2.boundingRect(build)
data = {
    "imgSize": [W, H], "bgGray": BG,
    "buildingBBox": [int(x), int(y), int(w), int(h)],
    "silhouette": sil,
    "classes": {
        "lights": "g>=232 发光体：弯月灯带 + 中央花形大灯",
        "ceiling": "185<=g<232 天花板亮面（主面）",
        "bevel": "165<=g<185 天花板斜面/过渡",
        "groove": "g<165 深缝勾边/凹槽",
    },
    "palette": PALETTE,
    "layers": layers,
}
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)

# ---- SVG (flat semantic colors) ----
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
parts.append(f'<rect width="{W}" height="{H}" fill="#dddddd"/>')
parts.append('<path d="%s" fill="%s"/>' % (
    "M" + " L".join(f"{px},{py}" for px, py in sil) + " Z", PALETTE["ceiling"]))
STROKE = {
    "lights": "#cfc9c6", "ceiling": "#c4bebb",
    "bevel": "#a8a2a0", "groove": "#7a7877",
}
for name in ["bevel", "groove", "ceiling", "lights"]:  # any order — per-group paths are exact
    L = layers[name]
    for grp in L["polys"]:
        d = " ".join("M" + " L".join(f"{px},{py}" for px, py in ring) + " Z" for ring in grp)
        parts.append(f'<path d="{d}" fill="{L["color"]}" stroke="{STROKE[name]}" '
                     f'stroke-width="0.8" fill-rule="evenodd"/>')
parts.append('</svg>')
svg = "\n".join(parts)
with open(OUT_SVG, "w", encoding="utf-8") as f:
    f.write(svg)

legend = "".join(
    f'<span style="display:inline-flex;align-items:center;gap:8px;margin:0 18px 6px 0">'
    f'<i style="width:18px;height:18px;background:{PALETTE[k]};border:1px solid #999;display:inline-block"></i>'
    f'<b style="font-weight:600">{k}</b><span style="color:#888">{v}</span></span>'
    for k, v in data["classes"].items())
html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>plan-trace v4 语义定稿</title>
<style>body{{margin:0;background:#2a2a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif}}
svg{{max-width:92vw;max-height:82vh;box-shadow:0 8px 40px rgba(0,0,0,.5);background:#ddd}}
.bar{{color:#ccc;font-size:13px;margin-top:14px}}</style>
</head><body>{svg}<div class="bar">{legend}</div></body></html>"""
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

cmp_img = np.full((H, W * 2 + 8, 3), 40, np.uint8)
cmp_img[:, :W] = img
cmp_img[:, W + 8:] = canvas
cv2.imwrite(OUT_CMP, cmp_img)
print("saved semantic v4 artifacts")
