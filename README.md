# Dream Gallery (梦幻画廊) — B612

> A Three.js 3D interactive game built on *The Little Prince*, with a single-file Node backend.
> Originally a "Kunlun mirror gallery"; the main line is now a playable retelling of the book:
> crash in the desert → draw a sheep → the home on B612 → six planets → a day on Earth → the well → the ending.

**English is the default language** for the game and the primary working language for this project
(docs, code comments, commit messages, tests). Chinese is an optional player-facing language behind the
EN / 中文 toggle; the story data stays bilingual.

## What this is

A self-hosted 3D interactive site. Players walk and glide across a desert, meet the Little Prince, and
follow the story from the crash site to B612, through six planets and a day on Earth, to the ending.
The owner manages visitors, approvals and content through an admin panel.

- **3D world**: a gallery hall, endless western-desert terrain, the Kunlun snow peak (solid-mountain rule),
  small-planet worlds (B612, the King, the Vain Man, the Tippler, the Businessman, the Lamplighter, the Geographer)
- **Story**: opening film → crash → draw the sheep → home on B612 (four memory stations) → planets 325–330 →
  Earth day → find the well → farewell → epilogue. Chapter map, star map, save codes and a portfolio of the
  player's unfinished drawings.
- **Systems**: story music (five tracks, per chapter), voiced dialogue (TTS), sheep companion,
  gallery uploads, whiteboard, chat room, AI captions
- **Legacy gameplay** (quiz gate, ark flight, eternal hall, …) is shelved by default; `?legacy=1` restores it.

## Tech stack

- **Frontend**: native ES Modules + Three.js 0.160 (native ESM in development, bundled by Vite 8 for production)
- **Backend**: Node router + `lib/` modules (`server.js` entry, declarative route table in `lib/routes.js`);
  persistence is **SQLite primary + JSON mirror** (`gate_data.db` / `gate_data.json`; `USE_SQLITE=0` rolls back)
- **Infrastructure**: Cloudflare CDN/R2 (media and models) + Alibaba Cloud origin (pm2 process `gallery`) +
  GitHub (off-site code backup — ⚠️ this repository is PUBLIC)

## Layout

```
server.js          # backend entry (require + routing + listen only)
lib/               # backend modules: config/util/store/gate/admin/quiz/files/siteconfig/vision/track/docs/chat/abuse/tts/aichannels (single source for AI channels)
src/               # frontend ES modules (main.js imports in order)
  ctx.js           # shared bus: registry + 7 namespaces (ui/kunlun/player/scene/media/gallery/mode)
  core/            # composition root, game state, game loop, world loader, scene manager
  ui/overlay.js    # overlay registry (cold core)
  state/store.js   # save-data registry (the only localStorage entry point, cold core)
  shared/          # pure logic + bilingual story text; mediarules.mjs is shared by frontend and backend
  scene/ gallery/ gate/ kunlun/ styles/
scripts/           # test/ (backend + mobile suites)  probe/ (real-browser probes)  gen/ (build/generators)
tools/             # backup-gallery.sh (cloud backup)  r2-upload.js (R2 upload)
questions/         # quiz bank (404 on the public site, contains answers)
docs               # AGENTS.md (engineering handbook)  ADMIN_GUIDE.md (admin manual)  RFC-架构深化.md  KUNLUN_PLAN.md
```

## Local development

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # required on Windows Git Bash
npm install                                   # postinstall syncs vendor/
npm run dev                                   # Vite dev server :5173 (API/media proxied to :3000) + backend
node server.js                                # or run the backend alone on :3000 (native ESM entry)
```

## Tests (all green before any deploy)

```bash
node scripts/test/test-store.js     # backend atomic-save suite
node scripts/test/test.js           # backend API / security / gate / upload / invites
node scripts/test/test-mobile.js    # mobile rendering (iPhone emulation: shader errors, JS exceptions, blank screen)
npm run test:unit                   # Vitest unit tests
npm run test:scene                  # scene screenshot regression
# focused probes live in scripts/probe/ (overlay, store, media-rules, security-fix, story chains, minimap, …)
```

## Deploy

```bash
npm run build                     # → dist/ (index.html + hashed assets/*)
bash scripts/release.sh           # full release: sync GitHub → unit tests → build → commit/push → deploy.sh
```

Detailed rules (media gating, light budget, video bitrate, HMR, overlays, save data, ctx namespaces,
security baseline) are in **AGENTS.md**; the visitor rules and admin operations are in **ADMIN_GUIDE.md**.

## Versions and backups

- Local git plus the **public** GitHub repo `bear20252026/dream-gallery` (⚠️ PUBLIC — never commit secrets).
  Commit and push before every deploy.
- Cloud cron: daily 03:17 (database + photos + music + code, keep 14) and weekly Sunday 04:23
  (videos, keep 2) → `/opt/backups/`.
- The start-screen version line ("Updated … · v1.N") is generated at build time from git.

## Credits

Third-party models, music, fonts and code are credited in **CREDITS.md** and **THIRD_PARTY_NOTICES.md**.

---

*Three thousand years, and the first to push this door open with a true heart is you.*
