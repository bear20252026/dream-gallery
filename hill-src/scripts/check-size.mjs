// Fails the build when the shipped bundle grows past the budget, so starter projects stay fast
// to load on mobile networks. JS/CSS are measured gzipped (what the CDN sends); fonts are already
// compressed woff2 and budgeted separately because CJK coverage is large.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const MB = 1024 * 1024
const BUDGET = { js: 2.0 * MB, fonts: 2.2 * MB, transfer: 4.4 * MB }
const walk = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const files = walk('../public/hill').map(path => {
  const raw = readFileSync(path)
  const text = /\.(js|css|html|json|svg)$/.test(path)
  return { path, size: raw.length, wire: text ? gzipSync(raw).length : raw.length }
})
const sum = pred => files.filter(pred).reduce((n, f) => n + f.wire, 0)
const js = sum(f => f.path.endsWith('.js'))
const fonts = sum(f => f.path.endsWith('.woff2'))
const transfer = sum(f => !f.path.endsWith('.txt'))
const mb = n => `${(n / MB).toFixed(2)} MB`
console.log(`bundle (gzip): js ${mb(js)} / fonts ${mb(fonts)} / transfer ${mb(transfer)}`)
const over = Object.entries({ js, fonts, transfer }).filter(([k, v]) => v > BUDGET[k])
if (over.length) {
  for (const [k, v] of over) console.error(`over budget: ${k} ${mb(v)} > ${mb(BUDGET[k])}`)
  process.exit(1)
}
