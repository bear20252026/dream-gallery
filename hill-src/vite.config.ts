import { defineConfig } from 'vitest/config'

// The Faraway hill, the place the player reaches after the story ends. It builds into the main
// game's public/hill/, so the main Vite build copies it to dist/hill/ and the site serves /hill/.
// Relative base keeps every asset path inside /hill/.
//
// __SOLO__ (2026-10-14, external audit round 5, item E): the build that ships inside Dream
// Gallery is a quiet, single-player hill — no sign-in, no shared room, no left-behind drawings.
// Until now that was only *hidden in the UI* (`document.body.dataset.solo`), so the login and
// note-upload code still shipped in the bundle. With a compile-time constant, Rollup folds
// `if (!__SOLO__)` to `if (false)`, drops those blocks, and — because tsconfig runs with
// noUnusedLocals — the now-unused network imports are removed from the source too, so the solo
// bundle contains no request that could be made at all. `HILL_SOLO=0 pnpm build` still produces
// the multiplayer variant.
const SOLO = process.env.HILL_SOLO !== '0'
export default defineConfig({
  base: './',
  define: { __SOLO__: JSON.stringify(SOLO) },
  server: { host: '127.0.0.1', port: 3270, strictPort: true },
  build: { outDir: '../public/hill', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
})
