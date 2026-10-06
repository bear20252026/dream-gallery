// voice-lines.test.js — the voiced-line collector covers every text module (2026-10-04)
import { describe, it, expect } from 'vitest';
import { collectVoiceLines, prioritizeLines, MAX_LINE_LEN } from '../shared/voice-lines.mjs';
import { voiceFor } from '../core/dialog-voice.mjs';
import * as STORY from '../shared/story-text.mjs';

const vf = (spk, text) => spk + ':' + (/[一-鿿]/.test(text) ? 'zh' : 'en');

describe('collectVoiceLines', () => {
  it('collects both languages, inherits the speaker from containers, skips who metadata', () => {
    const mod = {
      A: {
        who: { spk: 'king' },
        lines: [
          { en: 'Hello', zh: '你好' },
          { en: 'Bye', zh: '再见', who: { spk: 'prince' } },
        ],
      },
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
    const mod = {
      a: { en: 'Yes', zh: '是', who: { spk: 'king' } },
      b: { en: 'Yes', zh: '是', who: { spk: 'vain' } },
      c: { en: 'Yes', zh: '是', who: { spk: 'king' } },
    };
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
  it('trims the cut edge: a line whose 220th char is a space is collected without it (matches lib/tts.js trim→slice, 2026-10-05)', () => {
    // 服务端收到台词先 trim 再 slice(0,220) 才算缓存键;收集器若只 slice 不 trim,
    // 超长句截断处的行尾空格会让预煮/预热算出的 key 与服务端落盘 key 永远差一拍
    const raw = 'word '.repeat(60); // 300 字符,前 220 字符以空格结尾
    const lines = collectVoiceLines({ m: { a: { en: raw, zh: '' } } }, vf);
    const got = lines.find((l) => l.text.startsWith('word')).text;
    expect(got).toBe(raw.trim().slice(0, MAX_LINE_LEN).trim());
    expect(got.endsWith(' ')).toBe(false);
  });
  it('covers the merged text module whole — every story chapter is voiced', () => {
    const lines = collectVoiceLines({ 'story-text': STORY }, voiceFor);
    // 2026-10-05 台词三合一:主线上游 + 328-330/地球日 + 结局都来自同一个模块;
    // 这条护栏曾经按三模块分账(>300/>200/>150),合并后按单一来源合计
    expect(lines.length).toBeGreaterThan(650);
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
