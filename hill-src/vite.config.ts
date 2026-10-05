import { defineConfig } from 'vitest/config'

// The Faraway hill, the place the player reaches after the story ends. It builds into the main
// game's public/hill/, so the main Vite build copies it to dist/hill/ and the site serves /hill/.
// Relative base keeps every asset path inside /hill/.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 3270, strictPort: true },
  build: { outDir: '../public/hill', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
})
