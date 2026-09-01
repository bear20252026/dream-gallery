# -*- coding: utf-8 -*-
"""
finalize_v5: user-reviewed light deletion.
The numbered overlay (lights-numbered.png) showed every light component with
its id. The user picked which ids are NOT real lights -> reclassify those
components as ceiling. Runs directly on plan-trace5.json (no re-trace),
so component ids match the overlay exactly.
"""
import cv2, json
import numpy as np

ART = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts/"
OUT_JSON = ART + "plan-trace5.json"
OUT_SVG = ART + "plan-trace5.svg"
OUT_HTML = ART + "plan-trace5.html"
OUT_CMP = ART + "plan-trace5-compare.png"

# ids the user marked for deletion (from lights-numbered.png, current round)
EXCLUDE = {2, 7}

PALETTE = {
    "lights":  "#ffffff",
    "ceiling": "#d9d3d0",
    "bevel":   "#bdb7b4",
    "groove":  "#8f8d8c",
}
STROKE = {
    "lights": "#d8d2cf", "ceiling": "#cbc5c2",
    "bevel": "#aaa4a2", "groove": "#787675",
}
MIN_AREA = 198  # same as trace_plan7 (22 * 3 * 3)

data = json.load(open(OUT_JSON, encoding="utf-8"))
W1, H1 = data["imgSize"]
S = data["scale"]
W, H = W1 * S, H1 * S
sil = np.array(data["silhouette3x"], np.int32)

def mask_from_polys(polys):
    m = np.zeros((H, W), np.uint8)
    for grp in polys:
        cv2.fillPoly(m, [np.array(grp[0], np.int32)], 1)
        if len(grp) > 1:
            cv2.fillPoly(m, [np.array(r, np.int32) for r in grp[1:]], 0)
    return m

lights = mask_from_polys(data["layers"]["lights"]["polys"])
ceiling = mask_from_polys(data["layers"]["ceiling"]["polys"])
groove = mask_from_polys(data["layers"]["groove"]["polys"])
bevel = mask_from_polys(data["layers"]["bevel"]["polys"])

# ---- delete user-excluded light components (ids match the overlay) ----
n, lab, st, cent = cv2.connectedComponentsWithStats(lights, 8)
print("light comps before:", n - 1)
removed = 0
kept_ids = []
for i in range(1, n):
    comp = (lab == i)
    if i in EXCLUDE:
        ceiling[comp] = 1
        lights[comp] = 0
        removed += 1
    else:
        kept_ids.append(i)
print(f"removed {removed} comps, kept ids: {kept_ids}")

# guard: lights must never overlap ceiling after the move
overlap = int(((lights > 0) & (ceiling > 0)).sum())
if overlap:
    lights[(lights > 0) & (ceiling > 0)] = 0
    print("overlap resolved:", overlap, "px")

def trace(m):
    m = m.astype(np.uint8)
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

# rebuild polys for the two changed classes
data["layers"]["lights"]["polys"] = trace(lights)
data["layers"]["lights"]["px"] = int(lights.sum())
data["layers"]["lights"]["n"] = len(data["layers"]["lights"]["polys"])
data["layers"]["ceiling"]["polys"] = trace(ceiling)
data["layers"]["ceiling"]["px"] = int(ceiling.sum())
data["layers"]["ceiling"]["n"] = len(data["layers"]["ceiling"]["polys"])
data["classes"]["lights"] = "g>=232 发光体：真灯（用户确认 9 处：中央花形大灯+保留灯带）"
data["classes"]["ceiling"] = "185<=g<232 天花板亮面（含用户标注的非灯白区）"

for name in ["groove", "bevel", "ceiling", "lights"]:
    L = data["layers"][name]
    print(f"{name:8s} px={L['px']:8d} polys={L['n']:4d} {L['color']}")

# ---- render canvas (mask-exact) ----
canvas = np.full((H, W, 3), 221, np.uint8)
cv2.fillPoly(canvas, [sil], (208, 211, 217)[::-1])  # silhouette base
for name in ["groove", "bevel", "ceiling", "lights"]:
    hexcol = data["layers"][name]["color"]
    rgb = tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    m = mask_from_polys(data["layers"][name]["polys"])
    canvas[m > 0] = rgb[::-1]

# ---- SVG / HTML ----
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
parts.append(f'<rect width="{W}" height="{H}" fill="#dddddd"/>')
parts.append('<path d="%s" fill="%s"/>' % (
    "M" + " L".join(f"{px},{py}" for px, py in data["silhouette3x"]) + " Z", PALETTE["ceiling"]))
for name in ["bevel", "groove", "ceiling", "lights"]:
    L = data["layers"][name]
    for grp in L["polys"]:
        d = " ".join("M" + " L".join(f"{px},{py}" for px, py in ring) + " Z" for ring in grp)
        parts.append(f'<path d="{d}" fill="{L["color"]}" stroke="{STROKE[name]}" '
                     f'stroke-width="{0.8 * S}" fill-rule="evenodd"/>')
parts.append("</svg>")
with open(OUT_SVG, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

legend = "".join(
    f'<span style="display:inline-flex;align-items:center;gap:8px;margin:0 18px 6px 0">'
    f'<i style="width:18px;height:18px;background:{PALETTE[k]};border:1px solid #999;display:inline-block"></i>'
    f'<b style="font-weight:600">{k}</b><span style="color:#888">{v}</span></span>'
    for k, v in data["classes"].items())
svg_str = "\n".join(parts)  # includes full <svg>...</svg> wrapper
html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>plan-trace v5.2 高清语义定稿（用户确认灯位）</title>
<style>body{{margin:0;background:#2a2a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif}}
svg{{max-width:92vw;max-height:82vh;box-shadow:0 8px 40px rgba(0,0,0,.5);background:#ddd}}
.bar{{color:#ccc;font-size:13px;margin-top:14px}}</style>
</head><body>{svg_str}<div class="bar">{legend}</div></body></html>"""
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

# ---- compare + numbered overlay ----
img = cv2.imread(r"C:/Users/17296/.workbuddy/clipboard-images/clipboard-2026-09-01T16-12-51-419Z-a429c747.png")
img3 = cv2.resize(img, (W, H), interpolation=cv2.INTER_CUBIC)
cmp_img = np.full((H, W * 2 + 8, 3), 40, np.uint8)
cmp_img[:, :W] = img3
cmp_img[:, W + 8:] = canvas
cv2.imwrite(OUT_CMP, cmp_img)

vis = img3.copy()
ov = vis.copy()
ov[lights > 0] = (ov[lights > 0] * 0.5 + np.array([0, 0, 255]) * 0.5).astype(np.uint8)
cv2.addWeighted(ov, 0.55, vis, 0.45, 0, vis)
n2, lab2, st2, cent2 = cv2.connectedComponentsWithStats(lights, 8)
for i in range(1, n2):
    cx, cy = int(cent2[i][0]), int(cent2[i][1])
    cv2.putText(vis, str(i), (cx - 12, cy - 14), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (0, 0, 0), 6)
    cv2.putText(vis, str(i), (cx - 12, cy - 14), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (0, 255, 255), 3)
cv2.imwrite(ART + "lights-numbered.png",
            cv2.resize(vis, (W1 * 2, H1 * 2), interpolation=cv2.INTER_AREA))

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)
print("saved:", n2 - 1, "lights remain")
