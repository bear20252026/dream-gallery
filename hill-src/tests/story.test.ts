import { describe, expect, test } from 'vitest'
import { BOOKS, FOX_TAMED, STARS, chooseScript, type Line, type StoryState, type Target } from '../src/game/story'

const fresh = (): StoryState => ({ stars: [], fox: 0, awake: false, visits: {}, sproutsLeft: 4, roseSmeltFox: false })

/** Apply a talk's effects the way Encounters does (minus the 3D side). */
function talk(s: StoryState, target: Target, locale: 'zh-CN' | 'en' = 'zh-CN') {
  const c = chooseScript(BOOKS[locale], target, s)
  if (c.repeat) s.visits[target] = (s.visits[target] ?? 0) + 1
  const e = c.effects
  if (e.star && !s.stars.includes(e.star)) s.stars.push(e.star)
  if (e.fox !== undefined) s.fox = e.fox
  if (e.awaken) s.awake = true
  if (e.roseSmeltFox) s.roseSmeltFox = true
  if (e.pullSprout) s.sproutsLeft = Math.max(0, s.sproutsLeft - 1)
  return c
}

const isLine = (v: unknown): v is Line => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string'
/** Every script (a non-empty list of lines) in a book, by path. */
function scripts(v: unknown, path = '', out: Record<string, Line[]> = {}): Record<string, Line[]> {
  if (Array.isArray(v) && v.length > 0 && v.every(isLine)) out[path] = v
  else if (Array.isArray(v)) v.forEach((x, i) => scripts(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scripts(x, path ? `${path}.${k}` : k, out)
  return out
}

describe('story', () => {
  test('both languages carry the same complete set of scripts', () => {
    const zh = scripts(BOOKS['zh-CN'])
    const en = scripts(BOOKS.en)
    expect(Object.keys(zh).length).toBeGreaterThan(20)
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    for (const lines of [...Object.values(zh), ...Object.values(en)]) {
      for (const [who, text] of lines) {
        expect(['', 'fox', 'rose', 'sheep', 'tapir', 'shoebill', 'you']).toContain(who)
        expect(text.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('the fox is tamed on the third visit and then keeps talking', () => {
    const s = fresh()
    talk(s, 'fox')
    expect(s.fox).toBe(1)
    expect(s.stars).not.toContain('fox')
    talk(s, 'fox')
    talk(s, 'fox')
    expect(s.fox).toBe(FOX_TAMED)
    expect(s.stars).toContain('fox')
    expect(talk(s, 'fox').repeat).toBe(true)
    // The rose notices the fox once, after it is tamed.
    talk(s, 'rose')
    expect(talk(s, 'rose').effects.roseSmeltFox).toBe(true)
    expect(talk(s, 'rose').effects.roseSmeltFox).toBeFalsy()
  })

  test('the guardian wakes only once every star is lit', () => {
    const s = fresh()
    talk(s, 'guardian')
    expect(s.stars).toEqual(['guardian'])
    expect(talk(s, 'guardian').effects.awaken).toBeFalsy()
    for (const t of ['plane', 'hat', 'sprout', 'rose', 'sheep', 'box', 'tapir', 'shoebill'] as Target[]) talk(s, t)
    for (let i = 0; i < FOX_TAMED; i += 1) talk(s, 'fox')
    expect(s.stars.length).toBe(STARS.length)
    expect(talk(s, 'guardian').effects.awaken).toBe(true)
    expect(s.awake).toBe(true)
    expect(talk(s, 'guardian').effects.awaken).toBeFalsy()
  })
})
