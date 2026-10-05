import { describe, expect, test } from 'vitest'
import { cleanName, NAME_MAX, parseSave } from '../src/engine/save'
import { BOOKS, NAME_TOKEN, personalize } from '../src/game/story'

describe('the traveller’s name', () => {
  test('is cleaned before it is saved or shown', () => {
    expect(cleanName('  小\u0000王\u202e子  ')).toBe('小王子')
    expect(cleanName('a   b')).toBe('a b')
    expect(cleanName('{name}')).toBe('name')
    expect(Array.from(cleanName('一二三四五六七八九十甲乙丙丁')).length).toBe(NAME_MAX)
    expect(parseSave(JSON.stringify({ version: 1, name: ' 远方 ' })).name).toBe('远方')
    expect(parseSave(null).name).toBe('')
  })

  test('fills every name token in both languages', () => {
    for (const book of Object.values(BOOKS)) {
      const text = JSON.stringify(book)
      expect(text).toContain(NAME_TOKEN)
      expect(personalize(text, 'Lin')).not.toContain(NAME_TOKEN)
    }
  })
})
