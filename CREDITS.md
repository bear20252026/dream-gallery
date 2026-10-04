# CREDITS — Attribution and Licenses

This project is a self-hosted 3D interactive game. Except where stated below, all code and assets were written or made by the project's author.

## 3D building model (first-generation main hall shell)

| Item | Details |
| --- | --- |
| Model | modern luxury wedding arch house building design |
| Source | Sketchfab · zigurat architecture studio (@ziguratarchitecturestudio) |
| Model page | https://sketchfab.com/3d-models/modern-luxury-wedding-arch-house-building-design-42f122f0fef34eff9b217e25a6f4b300 |
| License | **CC BY 4.0** (Creative Commons Attribution 4.0 International, Sketchfab "CC Attribution") |
| License link | https://creativecommons.org/licenses/by/4.0/ |
| Local file | `models/hall/wedding-arch.glb` (about 8.4 MB) |
| Processing | The original 3ds Max source was converted to GLB in Blender; textures downsampled to 1024; ortho camera and lights removed. In game it is scaled proportionally by 36/27.6 and instanced three times along z to cover the whole hall. |

## Background music (2026-10-03)

The owner supplied five tracks as the story soundtrack and is responsible for their copyright
(owner's words: "I will handle the copyright myself").
Files are in `public/music/story/` (loudness-normalized to -18 LUFS, 112 kbps MP3); the arrangement is in `src/shared/story-music-logic.mjs`.

| Track | Artist / source | Where it plays |
| --- | --- | --- |
| Turnaround | Hans Zimmer & Camille — *The Little Prince (Original Motion Picture Soundtrack)* | The gate, the opening film, the crash and the sheep drawing, the night of the sheep box |
| Our Corner of the Universe | K.S. Rhoads | B612 — his home |
| Equation | Hans Zimmer & Camille — *The Little Prince (Original Motion Picture Soundtrack)* | The planets of the King / the Vain Man / the Tippler |
| Salvation (Remix) | Gabrielle Aplin & HEYHEY | Free roaming back in the desert, flying the plane |
| Somewhere Only We Know | Keane | Album pages, the farewell, six years later (the well-finding stretch is silent) |

As required by CC BY 4.0, attribution is given here:

> The model **modern luxury wedding arch house building design** is copyright **zigurat architecture studio**
> and is released under **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).
> This project only converts its format, rescales it and displays it; non-commercial release.

CC BY 4.0 requires this attribution file to be kept when the work is republished or redistributed; please carry this `CREDITS.md` along.

## 3D decorative model (four outdoor fountains)

| Item | Details |
| --- | --- |
| Model | Zsolnay Fountain (the fountain beside the Millennium House in Budapest; Zsolnay factory stoneware decoration, 1884–85) |
| Source | Sketchfab · georgiyhazankin (@georgiyhazankin) |
| Model page | https://sketchfab.com/3d-models/zsolnay-fountain-a3d182f3e0fb44dcbec52a60eba591dc |
| License | **CC BY 4.0** (Creative Commons Attribution 4.0 International, Sketchfab "CC Attribution") |
| License link | https://creativecommons.org/licenses/by/4.0/ |
| Local file | `models/hall/zsolnay-fountain.glb` (about 6.6 MB) |
| Processing | The original GLB was re-exported from Blender 5.2: textures 8192² → 2048² (22.3 MB → 6.6 MB); geometry kept at 197,600 faces with no decimation. In game it is scaled to 6 m in diameter; the four fountains share one geometry (clones reuse geometry/material) and are placed point by point on the desert terrain. |

As required by CC BY 4.0, attribution is given here:

> The model **Zsolnay Fountain** is copyright **georgiyhazankin**
> and is released under **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).
> This project only converts its format, downsamples textures, rescales it and displays it; non-commercial release.

Fountain layout (2026-09-03): south `(0, 42)` at the old outdoor whiteboard spot; north `(0, -26)`, east `(32, 8)` and
west `(-32, 8)` are placed symmetrically, 14 m from the building edge. The basins are solid stone and have collision
(transparent glass-like parts never block).

CC BY 4.0 requires this attribution file to be kept when the work is republished or redistributed; please carry this `CREDITS.md` along.

## 3D character model

| Item | Details |
| --- | --- |
| Model | Si (シ / Endfield administrator) |
| Source | Official public model from *Arknights: Endfield* |
| License | **CC BY 4.0** (Creative Commons Attribution 4.0 International) |
| License link | https://creativecommons.org/licenses/by/4.0/ |
| Local file | `public/models/avatar/` (at runtime `models/avatar/si.glb` is fetched from the CDN) |
| Processing | The original glTF was pruned/deduplicated with `@gltf-transform`, textures downsampled 2048 → 1024, and packed into a single GLB (about 7.7 MB, no Draco compression, for runtime compatibility). |

As required by CC BY 4.0, attribution is given here:

> The model **Si** is copyright Shanghai Hypergryph Network Technology Co., Ltd. and its licensors
> and is released under **CC BY 4.0**. This project only converts its format, downsamples textures and displays it;
> non-commercial release, and it does not represent the official position.

CC BY 4.0 requires this attribution file to be kept when the work is republished or redistributed; please carry this `CREDITS.md` along.

## Fonts

| Font | Use | License status |
| --- | --- | --- |
| Sabon / Sabon Next LT | Start-screen title, serif body text | Commercial font; **licensing is the site operator's responsibility** |
| Shipley | Start-screen italic subtitle | Commercial font; **licensing is the site operator's responsibility** |
| Zhi Mang Xing (志莽行书) | Chinese story text (dialogue / album pages / epilogue / film subtitles) | SIL OFL 1.1, © 2018 The Zhi Mang Xing Project Authors; subset in `src/styles/fonts/`, full license text in `ZhiMangXing-OFL.txt` |
| Satisfy | English story text (same places) and the start-screen handwritten subtitle | Apache License 2.0, © Sideshow; self-hosted Latin subset `src/styles/fonts/Satisfy-latin.woff2` |

The Sabon/Shipley files in `public/fonts/` are licensed copies supplied by the user (currently not referenced by code).
If you do not hold the matching licenses, replace them with open-source alternatives (for example EB Garamond,
Cormorant Garamond, Noto Serif SC). The story fonts' `@font-face` rules are all in `src/styles/main.css`.

## Other

- **Three.js** (MIT) — 3D rendering engine, bundled at build time.
- All other scene assets (paper terrain, hall shell, UI icons, etc.) are procedurally generated or hand-drawn for this project and carry no third-party license constraints.

## B612 story models (2026-09-07)

| Item | Details |
| --- | --- |
| Model | The Chibi Prince |
| Source | Sketchfab · bingko (@bingko) |
| Model page | https://sketchfab.com/3d-models/the-chibi-prince-ae60394446354a8abf2ab69d90260de5 |
| License | **CC BY 4.0** (Creative Commons Attribution 4.0 International, with a NoAI clause — it only forbids use as AI training data; normal display is unaffected; the owner confirmed "attribution is enough to use it freely") |
| Local file | `models/b612/chibi-prince.glb` (about 2.9 MB) |
| Processing | Normalized proportionally to a height of 0.8 m. The original has no skeletal animation; the approach and idle motions are procedural hops and gentle breathing. |

| Item | Details |
| --- | --- |
| Model | Piper PA-18 (a real aircraft model for the crash wreck) |
| Source | Sketchfab (author name to be added once the owner provides the model-page link) |
| License | **CC BY 4.0** (Creative Commons Attribution 4.0 International; the owner confirmed "attribution is enough to use it freely") |
| Local file | `models/b612/piper-pa18.glb` (about 1.7 MB) |
| Processing | Real aircraft proportions kept (10.7 m wingspan); posed nose-down in the sand with a sideways tilt, half buried, as the wreck; the fuselage has a solid collider. |

## Sheep companion model

The 3D sheep (`models/b612/sheep-companion.glb`) is by Kinga Kroliczek, CC BY 4.0; the metadata is preserved in the file.
The published copy is meshopt-compressed and quantized (787,976 → 158,264 bytes) without mesh simplification.
See the source note in the same directory.

As required by CC BY 4.0, keep this attribution file whenever the work is republished or redistributed; please carry this `CREDITS.md` along.
