// story-text-parity.test.js — 全剧本台词的中英对照测试(2026-10-05,主人要求,对齐 hill-src/tests/story.test.ts)
// 2026-10-05 台词三合一后,story-text.mjs 是唯一台词来源;本测试结构性递归遍历整个命名空间:
//   ①同构:凡含 en 的节点必含非空 zh,反之亦然;空串只许成对出现(如 WHO.caption 的 {en:'',zh:''})
//   ②裸字符串台词数组一律违法(旧 DIALOG_LINES.prince 那种纯英文数组就是漏译的温床)
//   ③who.spk 必须在声线登记集(说话人 id 或 edge-tts 原生音色名,见 AGENTS.md 台词声线分层)
//   ④总量护栏:collectVoiceLines 收集条目 ≥870(856 基线 + 王子 idle 补译 8 条)
// 加台词漏译、漏声线、删错字段,这里直接红 —— 不必等人玩到那一幕。
import { describe, it, expect } from 'vitest';
import * as STORY from '../shared/story-text.mjs';
import { collectVoiceLines } from '../shared/voice-lines.mjs';
import { voiceFor } from '../core/dialog-voice.mjs';

// 合法 spk:游戏说话人 id(dialog-voice SPK_VOICES_ZH/EN 的键)+ edge-tts 原生音色名(直传,不经映射)
const SPEAKER_IDS = new Set(['prince', 'pilot', 'sheep', 'rose', 'king', 'vain', 'tippler']);
const isLegalSpk = (spk) =>
  spk === '' || SPEAKER_IDS.has(spk) || /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+$/.test(spk);

// 结构遍历:en/zh 字符串节点 = 一条双语条目(不再下钻);对象/数组继续走
function walk(node, path, onEntry, onRaw) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === 'string') onRaw(path + '[' + i + ']', v);
      else walk(v, path + '[' + i + ']', onEntry, onRaw);
    });
    return;
  }
  if (typeof node.en === 'string' || typeof node.zh === 'string') {
    onEntry(node, path);
    return;
  }
  for (const k of Object.keys(node)) walk(node[k], path + '.' + k, onEntry, onRaw);
}

// 台词条目清单:每个元素 = {path, entry};顺带收集违法裸字符串
const entries = [];
const raws = [];
for (const k of Object.keys(STORY)) {
  walk(
    STORY[k],
    k,
    (e, p) => entries.push({ path: p, entry: e }),
    (p, s) => raws.push({ path: p, s })
  );
}

describe('story-text 中英对照(台词单一源,三合一后全量遍历)', () => {
  it('三合一后全部数据导出都在(防搬运漏节)', () => {
    for (const k of [
      'FILM',
      'GLOBAL',
      'STORY',
      'DIALOG_LINES',
      'SCENE2',
      'SCENE3',
      'SCENE4',
      'SCENE5',
      'B612_RETURN',
      'SCENE7_VANITY',
      'SCENE7_TIPPLER',
      'REPLIES',
      'SCENE_FOX',
      'FOX_UI',
      'WHO',
      'SCENE8_BUSINESS',
      'SCENE8_LAMP',
      'SCENE9_GEO',
      'SCENE10',
      'EARTH_UI',
      'VOYAGE',
      'BOOK_PAGES',
      'SCENE_WELL',
      'SCENE_FAREWELL',
      'SCENE_EPILOGUE',
      'ENDING_UI',
    ])
      expect(STORY[k], k).toBeTruthy();
  });

  it('凡有 en 必有 zh,凡有 zh 必有 en(逐条报路径)', () => {
    const bad = [];
    for (const { path, entry } of entries) {
      if (typeof entry.en !== 'string' || typeof entry.zh !== 'string')
        bad.push(path + ' → 缺一侧语言');
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('中英同空或同非空:不许单侧空串(空串只许成对,如 WHO.caption)', () => {
    const bad = [];
    for (const { path, entry } of entries) {
      if (!!entry.en.trim() === !!entry.zh.trim()) continue;
      bad.push(
        path +
          ' → en=' +
          JSON.stringify(entry.en.slice(0, 30)) +
          ' zh=' +
          JSON.stringify(entry.zh.slice(0, 30))
      );
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('没有裸字符串台词数组(纯英文/纯中文数组必须先改成 {en,zh})', () => {
    expect(
      raws.map((r) => r.path + ' → ' + r.s.slice(0, 40)),
      raws.map((r) => r.path)
    ).toEqual([]);
  });

  it('who.spk 全部在声线登记集(说话人 id / edge-tts 音色名 / 空串=默认羊皮卷)', () => {
    const bad = [];
    for (const { path, entry } of entries) {
      const spk = entry.who && entry.who.spk;
      if (spk !== undefined && !isLegalSpk(spk)) bad.push(path + ' → spk=' + JSON.stringify(spk));
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('音频收集护栏:全剧本可朗读条目 ≥870(856 基线 + 王子 idle 补译)', () => {
    expect(collectVoiceLines({ 'story-text': STORY }, voiceFor).length).toBeGreaterThanOrEqual(870);
  });
});
