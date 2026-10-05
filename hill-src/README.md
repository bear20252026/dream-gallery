> **In Dream Gallery:** this is the Faraway hill from `bear20252026/faraway-game`, the place the player reaches after the story ends.
> Here it runs alone (no Manus sign-in, online room or drawing notes). `pnpm install && pnpm build` writes `../public/hill/`,
> served at `/hill/`. See the 2026-10-05 entry in `../AGENTS.md`. The sections below are the original game's notes.

# 远方 · Faraway

A first-person three.js scene after an animated-film frame: a grassy, flowering hill above an
endless, rolling sea of cauliflower-headed cumulus under a deep blue sky. On the summit stands a
silent guardian: an ancient robot abandoned long ago, grey-white and weathered, moss and grass
growing on its shoulders and head, its long segmented arms hanging to the turf, with a red ribbon
tied round its arm streaming in the wind. Gulls circle the summit and glide over the cloud sea,
two small birds perch on the guardian, butterflies tumble over the slope, leaves and petals blow
past in the gusts, and a small white woolly creature sits by the guardian's resting hand.

```bash
pnpm install
pnpm dev      # Vite on PORT/HOST (Session preview); /api is proxied to API_PORT (default 3001)
pnpm build    # typecheck + production build + bundle budget
pnpm test     # unit tests (save, i18n, preview contract)
pnpm smoke    # after build: headless walk-through, menus in en/zh, phone layout → shots/smoke/
```

Controls: WASD / left stick to walk, mouse / right stick / right-side drag to look, Shift to run,
Space to jump, E (or click) to talk, like a fellow traveller or look at a drawing, Q to leave a
drawing, Esc to pause. Signing in with Manus is optional; it is only needed to leave a drawing.

## How the picture is made

| Path | Role |
| --- | --- |
| `src/game/clouds/` | Volumetric clouds: GPU-baked tileable Perlin-Worley noise (`noise3d.ts`), a sphere-lobe tower field baked to a 3D SDF plus a sea heightfield (`weather.ts`; each tower ends in a cauliflower head, a rosette of bulging domes with two generations of upward florets), a half-resolution raymarch with temporal reprojection (`shaders.ts`, `clouds.ts`). Clouds are shaded like painted anime cumulus: the ray bisects to a crisp cloud skin, and each lobe takes a soft cream-white to sky-blue terminator from the optical depth toward the sun, with sky-blue shade deepening under overhangs. Towers boil upward and the sea drifts with the wind. |
| `src/game/pipeline.ts` | Renders the scene to a depth target, runs the cloud passes, then composites sky, clouds and scene with a depth-aware upsample, tonemapping, saturation and vignette. The scene target is cleared to transparent black so MSAA edge coverage (grass against the sky) blends softly instead of snapping. |
| `src/game/terrain.ts` | The hill height function, its mesh and Rapier heightfield collider, and a height texture for the grass. |
| `src/game/grass.ts` | Painted meadow in world-anchored LOD rings: curved, tapering leaf blades with a lit and a shaded half up close, mip-mapped camera-facing tuft cards (a canvas-painted atlas, alpha-to-coverage under MSAA) further out, and single-species drifts of buttercups, daisies and lilac vetch (dense cores, sparse singles between, a far ring that keeps the drifts visible across the slope). Shares the turf's colour field (`GLSL_MEADOW` in `glsl.ts`) and the wind field: gust fronts and irregular ripples roll downwind across the hill, and every blade trembles at its own rate and phase. Where travellers walk, the blades lie over along their way, pale a little and barely tremble, then spring back (`trample.ts`). |
| `src/game/trample.ts` | The trodden-grass map: a 512² half-float top-down texture over the walkable hill (0.25 m per texel), ping-ponged every frame. Old prints fade, so the grass springs back in about ten seconds, and the feet of every traveller (you and up to seven others) press a soft footprint that reaches a little ahead while walking; the grass vertex shader reads it. |
| `src/game/ruin.ts` | The silent guardian: a procedurally built ancient robot, deliberately round and heavy and sitting in the grass (lathed pear-shaped body with a riveted belly plate and a wind-up key, a wide dome head with two big eyes under heavy lids that lift when it wakes, round cheeks and ears, short two-bone-IK arms ending in chubby mitten hands resting on the turf, short legs stretched out with oval soles), a weathering shader (moss, lichen, rain streaks, grime), wind-swayed grass tufts and daisies on its upward faces, two perched birds, the red band tied round a post on its head, the body capsules the silk and cords drape over, the rose's nook, and a trimesh collider. |
| `src/game/flyers.ts` | Gull flocks circling the summit and gliding over the cloud sea, and white butterflies over the slope: instanced meshes on analytic flight paths, banking into turns, with wings flapped in the vertex shader (glide pauses, lagging wingtips). |
| `src/game/drift.ts` | Leaves and petals carried by the wind: instanced cards simulated round the camera that follow the gusting wind, flutter, tumble, settle in the grass and lift again. |
| `src/game/story.ts` | All dialogue (Chinese and English), the ten stars and the pure script chooser (first visit, repeats, fox taming, the guardian's awakening). Lines address the player through a `{name}` token; the UI fills in the name typed on the title card (saved locally, else the Manus account name, else 旅人 / Traveller). |
| `src/game/props.ts` | The small things on the hill: the crashed biplane, the hat-shaped stone, the box with air holes, regrowing sprouts and the rose under its glass dome. |
| `src/game/fox.ts` | The fox: lying/standing pose blend, head tracking, moving closer on each visit, then following the player once tamed. |
| `src/game/tapir.ts` | A Malayan tapir grazing on the east slope: black at both ends with the white saddle, a restless three-segment trunk, white-rimmed ears. Ambles between grazing spots, stops to watch the player, curls its trunk and squeaks to greet them. |
| `src/game/shoebill.ts` | A shoebill on a low mossy stone: stilt legs, slate plumage and the mottled clog bill with its hooked nail. Stares with slow head turns and slow blinks, clatters its bill now and then, and bows, clattering, when a talk ends. |
| `src/game/encounters.ts` | What you are looking at (focus), what E does, story state and its effects; saves stars, the fox's taming and the guardian's eye. |
| `src/game/ribbon.ts` | Verlet cloth ribbon with aerodynamic wind forces, a swallowtail and hanging strings. |
| `src/game/rocks.ts`, `critter.ts` | Mossy rocks embedded in the slope; the white creature that breathes, blinks and watches you. |
| `src/game/wind.ts` | One gusting wind model shared by clouds, grass, ribbon and sound. It integrates how far the air has carried the gust pattern (`scroll`) and an eased gust, which drive `windAt()` in `glsl.ts`, so the meadow's motion stays continuous however the speed and direction wander. |
| `src/game/player.ts` | First-person controller on Rapier's kinematic character controller with a soft edge boundary. |
| `src/game/ambience.ts` | Procedural soundscape: gusting wind, whistle, the guardian's hollow hum, ribbon flutter, footsteps. |
| `src/game/social.ts` | The shared hill in the scene: other travellers as faint ghost silhouettes with scarves (interpolated poses), note flowers where drawings were left, like sparkles, and look-at focus for both. |
| `src/net/room.ts` | Room client: reads `/multiplayer/bootstrap.json`, connects over WSS with resume, sends poses, receives travellers and likes; falls back to solo quietly when offline or full. |
| `src/net/notes.ts` | Notes API client: public random drawings, one drawing by id (when someone on the same hill has just left it), and the signed-in traveller's own drawing (read / save) through the Manus bridge. |
| `src/ui/` | Title, HUD hints and captions, pause, settings, touch controls, Manus sign-in chip; `notepad.ts` is the drawing pad (draw, replay and sign-in modes, inks, undo, ink meter). A like shows its receiver a card: a beating heart, where the traveller stands (an arrow keeps pointing at them), and a running count by the presence pill; the sender is told it arrived. |
| `src/engine/` | Loop, renderer (adaptive resolution), input, audio, save, i18n, physics bootstrap. |
| `server/` | Manus login API (Webdev adapter, tRPC), `notes.mjs` (hand-drawn notes: validated strokes, one per signed-in account, public random and by-id reads) and `migrate.mjs`, which applies `0000_initial_users.sql` and `0001_notes.sql` once each. |
| `room-server/` | The shared hill's authoritative room (Node + `ws`): one room of 8 seats, Origin allowlist, validated and speed-clamped poses, likes, 20 s resume, `/healthz`. `node --test room.test.mjs`. |
| `multiplayer/config.json` | Build marker and WSS endpoint; the Vite plugin serves it as `/multiplayer/bootstrap.json` in dev and preview and emits it at build. |

Tuning lives in `src/game/config.ts` (sun, palette, cloud layout, player, quality presets).
Debug views: `?q=low|medium|high` forces a quality preset, `?play` skips the title and
`?cam=x,y,z,yawDeg,pitchDeg,fov[,g]` pins the camera (`g` = height above ground).
`node scripts/shot.mjs <url> <out.png> [frames] [w] [h]` captures a frame from the dev server.

## 同一座山丘 · The shared hill (online)

Everyone on the hill at the same time shares one room (up to 8; later arrivals walk the hill alone).
Travellers appear to each other as faint silhouettes, can give each other a like, and see drawings
that earlier travellers left behind. Nothing is required: offline, the game is the same solo hill.
The title card shows the live head-count (`Room.peek()` reads `/healthz`, which sends CORS headers
only to allowlisted origins); in play, the pill at the top left shows the room state.

- Server: cloud computer "R 李大猫 的云电脑 1" (`5bvxhktycvsdh52ch2mi3o1hc`, Southeast Asia), user
  service `faraway-room.service` on `127.0.0.1:9090` behind the shared Caddy gateway:
  `wss://faraway-136-85-86-130.sslip.io/ws`, health `https://faraway-136-85-86-130.sslip.io/healthz`.
  Running release: `releases/v3` (protocol marker still `faraway-room-v1`). Release 3 relays the id
  of a just-saved drawing to everyone else on the hill and lists recent ids in the welcome; each
  page then fetches the drawing itself from `/api/notes/:id`, so drawings never pass through the room.
- Allowed browser origins live in `~/faraway-room-server/room.env` on that computer: the published
  site `https://faraway.manustest.game` plus the development Preview origins. Add any new site
  origin there, then restart the service. Operations and gateway notes:
  `~/faraway-room-server/DEPLOY-NOTES.md` on that computer.
- Update the room by deploying `releases/vN` beside the current one, changing the unit's
  `WorkingDirectory` and restarting only `faraway-room.service`; bump the build marker in both
  `room-server/server.mjs` and `multiplayer/config.json` when the protocol changes.
- Two-client check: `node scripts/room-e2e.mjs [url]` (defaults to a local room on port 3002; see
  the script header).

## Rules for changes

- Every visible string is an i18n key in both `src/i18n/en.json` and `zh-CN.json` (a test
  enforces matching keys). Chinese glyphs come from the subset font in `public/fonts/`; check
  new Chinese text renders.
- Simulation runs in fixed `step()`s; visuals, wind and clouds advance in `render()`.
- Keep `pnpm build` within budget (`scripts/check-size.mjs`) and `pnpm smoke` green.

## Credits

Fonts: Sora, Figtree, Noto Sans SC — SIL Open Font License 1.1 (see `public/fonts/*-OFL.txt`).
Libraries: three.js (MIT), Rapier (Apache-2.0).
