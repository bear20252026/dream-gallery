# Plan view v2: top face = the EXACT pixel-rendered semantic trace the user
# already approved (4 classes + 7 lights), extruded only for thickness.
# Side walls = shifted copies of the top-face render, darkened per layer.
import cv2
import numpy as np
import json

BASE = r"C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/scripts/artifacts"
data = json.load(open(BASE + "/plan-trace5.json"))

W1, H1 = data["imgSize"]
S = data["scale"]
W, H = W1 * S, H1 * S

PAL = {  # fixed semantic palette (BGR) — same as approved trace
    "groove":  (140, 141, 143),
    "bevel":   (180, 183, 189),
    "ceiling": (208, 211, 217),
    "lights":  (255, 255, 255),
}
ORDER = ["groove", "bevel", "ceiling", "lights"]  # paint lights last

def fill_groups(canvas, grp_list, col):
    for grp in grp_list:
        rings = [np.array([[p[0] // S, p[1] // S] for p in r], np.int32) for r in grp]
        cv2.fillPoly(canvas, [rings[0]], col)
        if len(rings) > 1:
            cv2.fillPoly(canvas, rings[1:], col)

# ---------- top face at 1x ----------
sil = np.array(data["silhouette3x"], np.int32) // S
solid = np.zeros((H1, W1), np.uint8)
cv2.fillPoly(solid, [sil], 1)

top = np.full((H1, W1, 3), 221, np.uint8)
cv2.fillPoly(top, [sil], (203, 198, 196))
for name in ORDER:
    fill_groups(top, data["layers"][name]["polys"], PAL[name])
    # downscale 3x polys directly is fine (coords //S)

# ---------- extrusion ----------
DX, DY = 5, 4
N = 14
PAD = 24
canvas = np.full((H1 + PAD * 2 + N * DY + 30, W1 + PAD * 2 + N * DX + 30, 3), 221, np.uint8)

def paste(dst, src, ox, oy, factor):
    h, w = src.shape[:2]
    y0, x0 = oy, ox
    y1, x1 = min(y0 + h, dst.shape[0]), min(x0 + w, dst.shape[1])
    if y0 < 0:
        src = src[-y0:]; y0 = 0
    if x0 < 0:
        src = src[:, -x0:]; x0 = 0
    src = src[:dst.shape[0] - y0, :dst.shape[1] - x0]
    region = dst[y0:y0 + src.shape[0], x0:x0 + src.shape[1]]
    m = solid[:src.shape[0], :src.shape[1]] > 0
    dst[y0:y0 + src.shape[0], x0:x0 + src.shape[1]] = np.where(
        m[:, :, None], (src.astype(np.float32) * factor).astype(np.uint8), region)

# soft ground shadow
shadow = (solid * 90).astype(np.uint8)
shadow = cv2.GaussianBlur(shadow, (0, 0), 6)
sh_rgb = np.zeros_like(canvas[:, :, 0])
paste3 = np.zeros((H1, W1, 3), np.uint8)
paste3[:, :, 0] = shadow
paste(canvas, paste3, PAD + 4, PAD + 6, 1.0)

# side layers bottom -> top, gradually lighter
for k in range(N, 0, -1):
    t = 1 - k / N
    factor = 0.62 + 0.20 * t   # 0.62 (bottom) -> 0.82 (top)
    paste(canvas, top, PAD + DX * k, PAD + DY * k, factor)

# crisp top face last
paste(canvas, top, PAD, PAD, 1.0)
# outline
cv2.polylines(canvas, [sil + (PAD, PAD)], True, (120, 122, 126), 1, cv2.LINE_AA)

out = cv2.resize(canvas, (canvas.shape[1] * 2, canvas.shape[0] * 2),
                 interpolation=cv2.INTER_CUBIC)
cv2.imwrite(BASE + "/plan-final.png", out)
print("saved plan-final.png", out.shape)

# ---------- side-by-side: approved top-down trace vs new plan top face ----------
a = top.copy()
b = canvas[PAD:PAD + H1, PAD:PAD + W1].copy()
diff = np.any(np.abs(a.astype(int) - b.astype(int)) > 8, axis=2) & (solid > 0)
print("top-face mismatch inside silhouette:", int(diff.sum()), "px of", int(solid.sum()),
      f"({100 * diff.sum() / max(int(solid.sum()), 1):.3f}%)")
gap = np.full((H1, 12, 3), 40, np.uint8)
cmp_img = np.hstack([a, gap, b])
cmp_img = cv2.resize(cmp_img, (cmp_img.shape[1] * 2, cmp_img.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
cv2.imwrite(BASE + "/plan-final-vs-top.png", cmp_img)
print("saved plan-final-vs-top.png")
