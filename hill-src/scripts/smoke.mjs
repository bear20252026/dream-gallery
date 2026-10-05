// End-to-end smoke test: builds must already exist in dist/ (`pnpm build`).
// Serves dist/, boots the scene in headless Chromium (software WebGL, low quality), walks on the
// hill, triggers a discovery caption, walks the menus in English and Chinese, checks the phone
// layout, fails on any console error and writes screenshots to ./shots/.
// The login API is not part of the static build: /api answers with the bridge's documented
// offline response, so sign-in shows as unavailable and everything else must still work.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/?q=low`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
const guard = setTimeout(() => fail('timed out'), 480_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  await page.route('**/api/**', route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'online_preview_requires_checkpoint' }) }),
  )
  // The stubbed /api 503s are expected; every other console error fails the run.
  const stubbed = m => m.text().startsWith('Failed to load resource') && new URL(m.location().url || url, url).pathname.startsWith('/api/')
  page.on('console', m => m.type() === 'error' && !stubbed(m) && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && !new URL(r.url()).pathname.startsWith('/api/') && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('section[data-screen="title"].is-active', { timeout: 120_000 })
  await waitFrames(page, 4)
  return page
}

/** Software WebGL renders a few frames per second: wait on rendered frames, not wall time. */
async function waitFrames(page, n) {
  const target = (await page.evaluate(() => window.__frames ?? 0)) + n
  await page.waitForFunction(t => (window.__frames ?? 0) >= t, target, { timeout: 120_000, polling: 100 })
}

const state = page => page.evaluate(() => {
  const { game, ui, save } = window.__game
  const f = game.player.feet
  return { mode: game.mode, screen: ui.screen, pos: { x: f.x, y: f.y, z: f.z }, invertY: save.data.invertY }
})

try {
  await waitForServer()
  // Prefer Playwright's bundled Chromium; fall back to CHROME_PATH, a system Chromium or Chrome.
  const args = ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  browser = await chromium
    .launch({ args, executablePath: process.env.CHROME_PATH || undefined })
    .catch(() => chromium.launch({ args, executablePath: '/usr/bin/chromium' }))
    .catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []

  const en = await browser.newContext({ viewport: { width: 960, height: 540 }, locale: 'en-US' })
  const page = await openGame(en, errors)
  const account = await page.locator('.account-corner').getAttribute('data-status')
  if (account !== 'offline') throw new Error(`expected the sign-in chip to report offline, got ${account}`)
  await page.screenshot({ path: `${out}/01-title-en.png` })

  // Walk uphill toward the ruin.
  await page.click('section[data-screen="title"] [data-action="play"]')
  await page.waitForSelector('section[data-screen="hud"].is-active')
  const before = await state(page)
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await waitFrames(page, 14)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  await waitFrames(page, 2)
  await page.screenshot({ path: `${out}/02-walk.png` })
  const after = await state(page)
  const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)
  if (after.mode !== 'playing') throw new Error(`expected playing, got ${after.mode}`)
  if (moved < 0.5) throw new Error(`player barely moved (${moved.toFixed(2)} m)`)
  if (!(Math.hypot(after.pos.x, after.pos.z) < Math.hypot(before.pos.x, before.pos.z))) throw new Error('W did not walk toward the ruin')
  console.log(`smoke: walked ${moved.toFixed(1)} m toward the ruin`)

  // Arriving at the ruin shows its caption once (Game.discover through the real step).
  await page.evaluate(() => {
    const { game } = window.__game
    const p = game.player.feet.clone()
    p.set(p.x * 0.28, 0, p.z * 0.28)
    game.player.teleport(p, 0, 0)
  })
  await page.waitForSelector('.caption.is-active', { timeout: 60_000 })
  await waitFrames(page, 3)
  await page.screenshot({ path: `${out}/03-caption.png` })

  // Pause, Settings (a persisted toggle), back with Escape stays paused, then resume.
  await page.keyboard.press('Escape')
  await page.waitForSelector('section[data-screen="pause"].is-active')
  await waitFrames(page, 2)
  await page.screenshot({ path: `${out}/04-pause.png` })
  await page.click('section[data-screen="pause"] [data-action="settings"]')
  await page.waitForSelector('section[data-screen="settings"].is-active')
  const invertBefore = (await state(page)).invertY
  await page.click('.toggle[data-setting="invertY"]')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('skyruin.save') ?? '{}').invertY)
  if (stored === invertBefore) throw new Error('the invert-Y toggle was not saved')
  await waitFrames(page, 2)
  await page.screenshot({ path: `${out}/05-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('section[data-screen="pause"].is-active')
  if ((await state(page)).mode !== 'paused') throw new Error('leaving Settings with Escape resumed play')
  await page.click('section[data-screen="pause"] [data-action="resume"]')
  await page.waitForSelector('section[data-screen="hud"].is-active')
  if ((await state(page)).mode !== 'playing') throw new Error('Resume did not return to play')
  await en.close()

  const zh = await browser.newContext({ viewport: { width: 960, height: 540 }, locale: 'zh-CN' })
  const zhPage = await openGame(zh, errors)
  const lang = await zhPage.evaluate(() => document.documentElement.lang)
  if (lang !== 'zh-CN') throw new Error(`browser language not detected (lang=${lang})`)
  const title = await zhPage.locator('.title-name').innerText()
  if (!title.includes('远方')) throw new Error(`unexpected Chinese title: ${title}`)
  await zhPage.screenshot({ path: `${out}/06-title-zh.png` })
  await zh.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const phonePage = await openGame(phone, errors)
  await phonePage.tap('section[data-screen="title"] [data-action="play"]')
  await phonePage.waitForSelector('section[data-screen="hud"].is-active')
  await waitFrames(phonePage, 3)
  if (!(await phonePage.locator('.touch-jump').isVisible())) throw new Error('touch controls are not visible on the phone layout')
  await phonePage.screenshot({ path: `${out}/07-phone-hud.png` })
  await phone.close()

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (err) {
  await fail(err?.message ?? String(err))
}
