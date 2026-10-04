# Third-Party Asset and Code Notices

This game includes 3D models, audio and code from external open-source or freely usable sources. Everything is used for local research and in-game display, and the original attribution requirements are kept. Do not redistribute or use commercially without confirming the licenses.

## 3D models

| File | Use | Source / license |
|---|---|---|
| `models/hall/b612-gate-moss.glb` | Mossy ancient stone gate in the main world | Supplied by the user; from open model libraries such as Sketchfab; used under the original download license |
| `models/hall/b612-world/portal-platform.glb` | Stone platform for teleporting to the separate worlds | Same as above (compressed output of portal.glb, outer pillars hidden) |
| `models/hall/b612-world/king-scene.glb` | The King's planet scene | `el_principito-_escena_con_el_rey.glb` (Little Prince king scene) |
| `models/hall/b612-world/b612-storybook.glb` | B612 story scene | `storybookchallenge_-_the_little_prince.glb` |
| `models/hall/b612-world/purple-planet.glb` | Distant purple planet | `purple_planet.glb` (Sketchfab style) |
| `models/hall/b612-world/kepler.glb` | Distant planet | `kepler-452b.glb` |
| `models/hall/b612-world/exoplanets.glb` | Exoplanet cluster | `exoplanets.glb` |
| `models/hall/b612-world/various-planets.glb` | Distant multi-planet view | `various_planets.glb` |
| `models/showcase/ArchOfConstantine.glb` | Local showcase (not wired into the main line) | User's local reference |

All compressed outputs above were produced with gltf-transform (meshopt/webp). The original large files stay in the user's local Downloads folder and are not in the repository.

## Audio

| File | Use | Source |
|---|---|---|
| `media/gargantua/gargantua-intro.mp3` | Finale opening | Supplied by the user (from the GARGANTUA project) |
| `media/gargantua/gargantua-main.mp3` | B612 / finale ambient music | Same as above |

Story soundtrack tracks are listed in `CREDITS.md`.

## Code / shaders

| File | Use | Source |
|---|---|---|
| `dev/kimi-planets/gargantua/**` | Black-hole ray-tracing reference (not bundled into production) | GARGANTUA Schwarzschild raytracer (supplied by the user) |
| Opening hand-drawn / old-map animation | Opening film | Original to this project |

## Compliance notes

- This repository is public, but the original model and audio files above were not created by the repository author; they are used in compressed form, with pillars hidden, and for non-commercial display only.
- If an original asset requires attribution, credit the author and license from each source before publishing or using it commercially.
- Keep `THIRD_PARTY_NOTICES.md` in the repository in sync.
