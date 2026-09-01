# Oblique 2.5D preview rendered FROM the real trace data (plan-trace5.json)
# No hand-drawn shapes: silhouette + lights come straight from the JSON.
import cv2
import numpy as np

BASE = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts"
data = json.load(open(BASE + "/plan-trace5.json")) if False else None
import json
data = json.load(open(BASE + "/plan-trace5.json"))

W1, H1 = data["imgSize"]
S = data["scale"]
sil = np.array(data["silhouette3x"], np.int32) // S  # 1x coords

DX, DY = 4, 3     # per-layer offset (down-right = extrusion direction)
N = 10            # number of side layers

canvas = np.full((H1 + N * DY + 20, W1 + N * DX + 20, 3), 221, np.uint8)

def shift(pts, dx, dy):
    return np.array(pts, np.int32) + np.array([dx, dy], np.int32)

# side layers: bottom (darkest) -> top (lightest), drawn bottom first
for k in range(N, 0, -1):
    t = k / N
    # dark grey -> near-top grey
    c = (int(150 - 40 * (1 - t)), int(148 - 40 * (1 - t)), int(145 - 38 * (1 - t)))
    cv2.fillPoly(canvas, [shift(sil, 10 + DX * k, 10 + DY * k)], c)

# top face: silvery white
top_off = (10, 10)
cv2.fillPoly(canvas, [shift(sil, *top_off)], (232, 229, 224))
cv2.polylines(canvas, [shift(sil, *top_off)], True, (140, 141, 143), 1)

# lights on top face, straight from JSON polys (with holes)
lights = []
for grp in data["layers"]["lights"]["polys"]:
    rings = [shift([[p[0], p[1]] for p in ring], *top_off) for ring in
             [[[pp[0] / S, pp[1] / S] for pp in ring] for ring in grp]]
    lights.append(rings)
for rings in lights:
    cv2.fillPoly(canvas, [rings[0]], (255, 255, 255))
    if len(rings) > 1:
        cv2.fillPoly(canvas, rings[1:], (255, 255, 255))

out = cv2.resize(canvas, (canvas.shape[1] * 3 // 2, canvas.shape[0] * 3 // 2),
                 interpolation=cv2.INTER_CUBIC)
cv2.imwrite(BASE + "/oblique-preview.png", out)
print("saved oblique-preview.png", out.shape)

# side-by-side with the user's 3D reference
ref = cv2.imread(r"C:/Users/17296/.workbuddy/clipboard-images/clipboard-2026-09-01T19-25-47-994Z-85d4cafb.png")
h = 700
a = cv2.resize(ref, (int(ref.shape[1] * h / ref.shape[0]), h), interpolation=cv2.INTER_AREA)
b = cv2.resize(out, (int(out.shape[1] * h / out.shape[0]), h), interpolation=cv2.INTER_AREA)
gap = np.full((h, 12, 3), 40, np.uint8)
cv2.imwrite(BASE + "/oblique-vs-ref.png", np.hstack([a, gap, b]))
print("saved oblique-vs-ref.png")
