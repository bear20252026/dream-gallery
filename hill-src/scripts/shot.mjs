// Dev tool: capture a screenshot of the running dev server with software WebGL.
//   node scripts/shot.mjs [url] [out.png] [frames] [width] [height] [evalScript]
import { chromium } from 'playwright'

const [url = 'http://127.0.0.1:3000/', out = 'shots/dev.png', frames = '24', width = '1280', height = '590', evalScript = ''] = process.argv.slice(2)
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
const browser = await chromium.launch({ args, executablePath: process.env.CHROME_PATH || undefined }).catch(() => chromium.launch({ args, executablePath: '/usr/bin/chromium' }))
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, locale: process.env.LOCALE || undefined })
const logs = []
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
const t0 = Date.now()
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => window.__frames > 0, null, { timeout: 180000 }).catch(() => logs.push('[shot] no frames rendered'))
if (evalScript) await page.evaluate(evalScript).catch(e => logs.push(`[eval] ${e.message}`))
const target = Number(frames)
await page
  .waitForFunction(n => (window.__frames ?? 0) >= n, target, { timeout: 600000, polling: 500 })
  .catch(() => logs.push('[shot] frame target not reached'))
const rendered = await page.evaluate(() => window.__frames ?? 0)
await page.screenshot({ path: out })
console.log(`shot: ${out} frames=${rendered} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
for (const l of logs.slice(0, 40)) console.log(l)
// Lines tagged PROBE come from eval scripts; always print them even after the first 40.
for (const l of logs.slice(40)) if (l.includes('PROBE')) console.log(l)
await browser.close()
