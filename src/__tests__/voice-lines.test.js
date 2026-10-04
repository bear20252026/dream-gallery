// voice-lines.test.js — the voiced-line collector covers every text module (2026-10-04)
import { describe, it, expect } from 'vitest';
import { collectVoiceLines, prioritizeLines, MAX_LINE_LEN } from '../shared/voice-lines.mjs';
import { voiceFor } from '../core/dialog-voice.mjs';
import * as STORY from '../shared/story-text.mjs';
import * as LATE from '../shared/story-text-late.mjs';
import * as ENDING from '../shared/ending-text.mjs';

const vf = (spk, text) => spk + ':' + (/[一-鿿]/.test(text) ? 'zh' : 'en');

describe('collectVoiceLines', () => {
  it('collects both languages, inherits the speaker from containers, skips who metadata', () => {
    const mod = {
      A: { who: { spk: 'king' }, lines: [{ en: 'Hello', zh: '你好' }, { en: 'Bye', zh: '再见', who: { spk: 'prince' } }] },
      helper: () => 1,
    };
    const lines = collectVoiceLines({ m: mod }, vf);
    expect(lines.map((l) => [l.lang, l.spk, l.text])).toEqual([
      ['en', 'king', 'Hello'],
      ['zh', 'king', '你好'],
      ['en', 'prince', 'Bye'],
      ['zh', 'prince', '再见'],
    ]);
  });
  it('dedupes the same text with the same voice, keeps the same text with a different voice', () => {
    const mod = { a: { en: 'Yes', zh: '是', who: { spk: 'king' } }, b: { en: 'Yes', zh: '是', who: { spk: 'vain' } }, c: { en: 'Yes', zh: '是', who: { spk: 'king' } } };
    expect(collectVoiceLines({ m: mod }, vf).length).toBe(4); // king en/zh + vain en/zh
  });
  it('cuts long lines at the server limit and survives cycles', () => {
    const a = { en: 'x'.repeat(500), zh: '' };
    const loop = { child: { en: 'ok', zh: '好' } };
    loop.self = loop;
    const lines = collectVoiceLines({ m: { a, loop } }, vf);
    expect(lines.find((l) => l.text.startsWith('xxx')).text.length).toBe(MAX_LINE_LEN);
    expect(lines.some((l) => l.text === 'ok')).toBe(true);
  });
  it('covers all three real text modules, not only story-text', () => {
    const lines = collectVoiceLines({ 'story-text': STORY, 'story-text-late': LATE, 'ending-text': ENDING }, voiceFor);
    const by = (s) => lines.filter((l) => l.src === s).length;
    expect(by('story-text')).toBeGreaterThan(300);
    expect(by('story-text-late')).toBeGreaterThan(200); // 328-330, Earth day: missed by the old prewarm
    expect(by('ending-text')).toBeGreaterThan(150); // the ending: missed by the old prewarm
    expect(lines.every((l) => l.voice && l.text)).toBe(true);
  });
});

describe('prioritizeLines', () => {
  it('puts the current language first and keeps story order inside each language', () => {
    const L = [
      { lang: 'en', text: 'a' },
      { lang: 'zh', text: 'b' },
      { lang: 'en', text: 'c' },
      { lang: 'zh', text: 'd' },
    ];
    expect(prioritizeLines(L, 'zh').map((l) => l.text)).toEqual(['b', 'd', 'a', 'c']);
    expect(prioritizeLines(L, 'en').map((l) => l.text)).toEqual(['a', 'c', 'b', 'd']);
  });
});
