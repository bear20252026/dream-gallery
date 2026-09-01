# -*- coding: utf-8 -*-
"""
plan-trace v5: HIGH-RES semantic trace.
Same 4-class logic as v4.1, but the source image is upscaled 3x (cubic)
before classification, so every contour is traced at 3x pixel density ->
sharper edges, cleaner small blocks, no change to classification rules.
Output coords are in 3x space; JSON stores "scale": 3 (divide by 3 for px, then scale to meters).
"""
import cv2, json
import numpy as np

SRC = r"C:/Users/17296/.workbuddy/clipboard-images/clipboard-2026-09-01T16-12-51-419Z-a429c747.png"
ART = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/"
OUT_JSON = ART + "plan-trace5.json"
OUT_SVG = ART + "plan-trace5.svg"
OUT_HTML = ART + "plan-trace5.html"
OUT_CMP = ART + "plan-trace5-compare.png"

BG = 221.0
S = 3                      # upscale factor
MIN_AREA = 22 * S * S      # 198
LIGHT_MIN = 40 * S * S     # 360
COMP_MIN = 300 * S * S     # 2700
K_OPEN = 3 * S             # 9
K_BAND = 11 * S            # 33

PALETTE = {
    "lights":  "#ffffff",
    "ceiling": "#d9d3d0",
    "bevel":   "#bdb7b4",
    "groove":  "#8f8d8c",
}

img0 = cv2.imread(SRC)
H0, W0 = img0.shape[:2]
img = cv2.resize(img0, (W0 * S, H0 * S), interpolation=cv2.INTER_CUBIC)
H, W = img.shape[:2]
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.int16)

diff = np.abs(g.astype(np.float32) - BG)
build = (diff > 6).astype(np.uint8)
build = cv2.morphologyEx(build, cv2.MORPH_OPEN, np.ones((K_OPEN, K_OPEN), np.uint8))
n, lab, stats, cent = cv2.connectedComponentsWithStats(build, 8)
build = np.zeros_like(build)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= COMP_MIN:
        build[lab == i] = 1

def trace(m):
    cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return []
    hier = hier[0]
    groups = []
    for i, c in enumerate(cnts):
        if hier[i][3] != -1:
            continue
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

# rim-highlight removal: lights must NOT touch the solid silhouette edge
cnts0, _ = cv2.findContours(build, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
solid = np.zeros_like(build)
cv2.fillPoly(solid, [max(cnts0, key=cv2.contourArea)], 1)
edge_band = (solid & ~cv2.erode(solid, np.ones((K_BAND, K_BAND), np.uint8))).astype(np.uint8)
lm = SEM[3][1].astype(np.uint8)
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(lm, 8)
lights_clean = np.zeros_like(lm)
rim_hl = np.zeros_like(lm)
rm_n = 0
for i in range(1, n2):
    comp = (lab2 == i)
    if (comp & (edge_band > 0)).any():
        rim_hl[comp] = 1
        rm_n += 1
    elif st2[i, cv2.CC_STAT_AREA] >= LIGHT_MIN:
        lights_clean[comp] = 1
print(f"lights refine: removed {rm_n} rim comps, lights {int(lm.sum())} -> {int(lights_clean.sum())} px")
SEM[3] = ("lights", lights_clean > 0)
SEM[2] = ("ceiling", SEM[2][1] | (rim_hl > 0))

# ---- fill holes inside lights: a lamp is ONE clean emissive body ----
# Overexposed blooms have midtone speckles inside; any region fully enclosed
# by the lights mask (all its boundary pixels are lights) belongs to the lamp.
lights_u8 = SEM[3][1].astype(np.uint8)
for _pass in range(3):  # iterate: absorbing islands can enclose new ones
    inv = (1 - lights_u8).astype(np.uint8)
    n3, lab3, st3, _ = cv2.connectedComponentsWithStats(inv, 8)
    filled = 0
    for i in range(1, n3):
        comp = (lab3 == i)
        a = int(st3[i, cv2.CC_STAT_AREA])
        if a > 8000 or a < 20:
            continue  # tiny noise or big real region
        ys, xs = np.nonzero(comp)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == H - 1 or xs.max() == W - 1:
            continue
        dil = cv2.dilate(comp.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        ring = dil & ~comp
        frac = float(lights_u8[ring].mean())
        if frac >= 0.75:  # boundary overwhelmingly lights -> part of the lamp
            lights_u8[comp] = 1
            filled += 1
    print(f"lights island-absorb pass{_pass+1}: {filled} absorbed")
    if filled == 0:
        break
print(f"lights -> {int(lights_u8.sum())} px")

# ---- central lamp cleanup: biggest light component = the flower lamp ----
# Its interior carries overexposure shading (gray 229-230) connected to the
# outside shading network via thin channels -> island absorb can't catch it.
# Morph-close JUST this component (fills internal shading), then hole-fill,
# and adopt the solid result as lamp body. Smaller crescents stay untouched.
n4, lab4, st4, _ = cv2.connectedComponentsWithStats(lights_u8, 8)
big = 1 + int(np.argmax(st4[1:, cv2.CC_STAT_AREA]))
lamp = (lab4 == big).astype(np.uint8)
print(f"central lamp comp: area {int(st4[big, cv2.CC_STAT_AREA])} px")
lamp_c = cv2.morphologyEx(lamp, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
# hole-fill the closed lamp
inv2 = (1 - lamp_c).astype(np.uint8)
n5, lab5, st5, _ = cv2.connectedComponentsWithStats(inv2, 8)
for i in range(1, n5):
    comp = (lab5 == i)
    ys, xs = np.nonzero(comp)
    if ys.min() == 0 or xs.min() == 0 or ys.max() == H - 1 or xs.max() == W - 1:
        continue
    lamp_c[comp] = 1
grown = int((lamp_c > 0).sum() - lamp.sum())
print(f"lamp solid: +{grown} px vs raw comp")
# central lamp cleanup: the photo has WATERMARK circles ("2"/"3"/"4", gray
# 165-174) and overexposure shading inside/around the bloom — not architecture.
# Within a small zone around the lamp, absorb everything except the dark
# groove frame (g<160) into the lamp -> one clean white flower lamp.
lamp_zone = cv2.dilate(lamp_c, np.ones((40, 40), np.uint8)) > 0
absorb = lamp_zone & (solid > 0) & (g >= 160)
print(f"lamp cleanup absorbed: +{int(absorb.sum())} px (incl. watermarks)")
lights_final = ((lights_u8 > 0) | ((lamp_c > 0) & (solid > 0)) | absorb)
# final hole-fill inside lights to clear any leftover islands
inv3 = (1 - lights_final.astype(np.uint8)).astype(np.uint8)
n6, lab6, st6, _ = cv2.connectedComponentsWithStats(inv3, 8)
for i in range(1, n6):
    comp = (lab6 == i)
    a = int(st6[i, cv2.CC_STAT_AREA])
    if a > 8000 or a < 20:
        continue
    ys, xs = np.nonzero(comp)
    if ys.min() == 0 or xs.min() == 0 or ys.max() == H - 1 or xs.max() == W - 1:
        continue
    dil = cv2.dilate(comp.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    if float(lights_final[dil & ~comp].mean()) < 0.75:
        continue
    # gray sanity: true lights are bright; dark islands are watermark/shadow
    if float(np.median(g[comp])) < 205:
        continue
    lights_final[comp] = True
# final safety net: demote any light component that is overall dark
# (watermark circles / shadow spots absorbed by earlier passes)
n7, lab7, st7, _ = cv2.connectedComponentsWithStats(lights_final.astype(np.uint8), 8)
demoted = 0
lights_u8f = lights_final.astype(np.uint8)
bevel_add = np.zeros_like(lights_u8f)
for i in range(1, n7):
    comp = (lab7 == i)
    if float(np.median(g[comp])) >= 205:
        continue
    bevel_add[comp] = 1
    lights_u8f[comp] = 0
    demoted += 1
if demoted:
    print(f"lights demote: {demoted} dark component(s) -> bevel")
lights_u8f = lights_u8f > 0
SEM[3] = ("lights", lights_u8f)
SEM[1] = ("bevel", (SEM[1][1] | (bevel_add > 0)) & ~lights_u8f)
SEM[2] = ("ceiling", SEM[2][1] & ~lights_u8f)

canvas = np.full((H, W, 3), 221, np.uint8)
layers = {}
for name, mask in SEM:
    mask = mask.astype(np.uint8)
    hexcol = PALETTE[name]
    rgb = tuple(int(hexcol[i:i+2], 16) for i in (1, 3, 5))
    canvas[mask > 0] = rgb[::-1]
    polys = trace(mask)
    layers[name] = {"color": hexcol, "px": int(mask.sum()), "polys": polys, "n": len(polys)}
    print(f"{name:8s} px={int(mask.sum()):8d} polys={len(polys):4d} {hexcol}")

cnts, _ = cv2.findContours(build, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
outer = max(cnts, key=cv2.contourArea)
sil = [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in outer[:, 0, :].astype(np.float64)]

x, y, w, h = cv2.boundingRect(build)
data = {
    "imgSize": [W0, H0], "scale": S, "bgGray": BG,
    "buildingBBox3x": [int(x), int(y), int(w), int(h)],
    "silhouette3x": sil,
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

# ---- SVG at 3x ----
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
parts.append(f'<rect width="{W}" height="{H}" fill="#dddddd"/>')
parts.append('<path d="%s" fill="%s"/>' % (
    "M" + " L".join(f"{px},{py}" for px, py in sil) + " Z", PALETTE["ceiling"]))
STROKE = {
    "lights": "#d8d2cf", "ceiling": "#cbc5c2",
    "bevel": "#aaa4a2", "groove": "#787675",
}
for name in ["bevel", "groove", "ceiling", "lights"]:
    L = layers[name]
    for grp in L["polys"]:
        d = " ".join("M" + " L".join(f"{px},{py}" for px, py in ring) + " Z" for ring in grp)
        parts.append(f'<path d="{d}" fill="{L["color"]}" stroke="{STROKE[name]}" '
                     f'stroke-width="{0.8*S}" fill-rule="evenodd"/>')
parts.append('</svg>')
with open(OUT_SVG, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

legend = "".join(
    f'<span style="display:inline-flex;align-items:center;gap:8px;margin:0 18px 6px 0">'
    f'<i style="width:18px;height:18px;background:{PALETTE[k]};border:1px solid #999;display:inline-block"></i>'
    f'<b style="font-weight:600">{k}</b><span style="color:#888">{v}</span></span>'
    for k, v in data["classes"].items())
# svg_str must include the full <svg>...</svg> wrapper (parts[0] is the opening tag)
svg_str = "\n".join(parts)
html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>plan-trace v5 高清语义定稿</title>
<style>body{{margin:0;background:#2a2a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif}}
svg{{max-width:92vw;max-height:82vh;box-shadow:0 8px 40px rgba(0,0,0,.5);background:#ddd}}
.bar{{color:#ccc;font-size:13px;margin-top:14px}}</style>
</head><body>{svg_str}<div class="bar">{legend}</div></body></html>"""
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

# compare: left = original upscaled 3x, right = canvas (both 3x)
cmp_img = np.full((H, W * 2 + 8, 3), 40, np.uint8)
cmp_img[:, :W] = img
cmp_img[:, W + 8:] = canvas
cv2.imwrite(OUT_CMP, cmp_img)
print("saved v5 artifacts at", S, "x")
