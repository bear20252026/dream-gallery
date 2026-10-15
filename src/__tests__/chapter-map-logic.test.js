// chapter-map-logic.test.js — 章节地图与存档码(2026-10-03)
import { describe, it, expect } from 'vitest';
import {
  chapterList,
  chapterStates,
  canTravel,
  encodeSave,
  decodeSave,
  applySave,
  collectSave,
  importSave,
  restoreSave,
  MAX_CODE_CHARS,
  SAVE_FIELDS,
} from '../shared/chapter-map-logic.mjs';

const ids = () => chapterList().map((c) => c.id);
const states = (f) => Object.fromEntries(chapterStates(f).map((c) => [c.id, c.state]));

function fakeStore(init = {}) {
  const m = { ...init };
  return {
    m,
    flag: (k) => !!m[k],
    mark: (k) => (m[k] = true),
    unmark: (k) => delete m[k],
    num: (k) => Number(m[k]) || 0,
    setNum: (k, v) => (m[k] = v),
    str: (k) => m[k] || '',
    setStr: (k, v) => (m[k] = v),
    json: (k, d) => (k in m ? m[k] : d),
    setJson: (k, v) => (m[k] = v),
  };
}

describe('chapter map', () => {
  it('按原著顺序:坠机 → 家 → 已建成的星球 → 结局', () => {
    expect(ids()).toEqual([
      'crash',
      'home',
      'king325',
      'king326',
      'king327',
      'king328',
      'king329',
      'king330',
      'earth',
      'ending',
    ]);
  });
  it('新存档:只有第一章是当前,其余锁住', () => {
    expect(states({})).toEqual({
      crash: 'current',
      home: 'locked',
      king325: 'locked',
      king326: 'locked',
      king327: 'locked',
      king328: 'locked',
      king329: 'locked',
      king330: 'locked',
      earth: 'locked',
      ending: 'locked',
    });
  });
  it('画完羊 → 家是当前;家走完 → 325 是当前', () => {
    expect(states({ scene2: true }).home).toBe('current');
    const s = states({ scene2: true, page1: true });
    expect(s.home).toBe('done');
    expect(s.king325).toBe('current');
    expect(s.king326).toBe('locked');
  });
  it('六颗星走完 → 地球之日是当前;地球走完 → 结局是当前;结局走完全部完成', () => {
    expect(states({ scene2: true, page1: true, chapter: 3 }).king328).toBe('current');
    const f = { scene2: true, page1: true, chapter: 6 };
    expect(states(f).earth).toBe('current');
    expect(states(f).ending).toBe('locked');
    expect(states({ ...f, earthDay: true }).ending).toBe('current');
    expect(states({ ...f, endingStep: 4 }).ending).toBe('done');
  });
  it('只能去已完成或当前的章节', () => {
    expect(canTravel('done')).toBe(true);
    expect(canTravel('current')).toBe(true);
    expect(canTravel('locked')).toBe(false);
  });
  it('存档码往返一致,坏码返回 null', () => {
    const src = fakeStore({
      scene2: true,
      page1: true,
      planetsChapter: 2,
      homeMemoryStep: 4,
      endingAnswer: 'no',
      portfolio: { boa: { strokes: ['M0,0 L1,1'], at: 1 } },
    });
    const code = encodeSave(src);
    expect(code.startsWith('B612-1-')).toBe(true);
    const data = decodeSave(code);
    const dst = fakeStore({ endingStep: 3, page2: true });
    applySave(dst, data);
    expect(dst.flag('scene2')).toBe(true);
    expect(dst.flag('page2')).toBe(false);
    expect(dst.num('planetsChapter')).toBe(2);
    expect(dst.num('endingStep')).toBe(0);
    expect(dst.json('portfolio', null).boa.strokes).toEqual(['M0,0 L1,1']);
    expect(decodeSave('hello')).toBeNull();
    expect(decodeSave('B612-1-@@@')).toBeNull();
    expect(Object.keys(SAVE_FIELDS)).toContain('portfolio');
  });
  it('存档码里的数字被钳住', () => {
    const code =
      'B612-1-' +
      Buffer.from(JSON.stringify({ planetsChapter: 1e9, endingAnswer: 5 })).toString('base64');
    const d = decodeSave(code);
    expect(d.planetsChapter).toBe(99);
    expect(d.endingAnswer).toBe('');
  });
  // —— 2026-10-14 第五轮审计 G 的两处真缺口 ——
  it('超长码在解码之前就被拒(不是靠 try/catch 兜住)', () => {
    const mk = (n) =>
      'B612-1-' +
      Buffer.from(JSON.stringify({ portfolio: { x: 'a'.repeat(n) } })).toString('base64');
    const big = mk(9000);
    expect(big.length).toBeGreaterThan(MAX_CODE_CHARS);
    expect(decodeSave(big)).toBeNull();
    // 同一形态、内容同样"没人见过"的码,**没超长度**时照样解得出来 ⇒ 这条判的是长度,不是内容坏了
    const small = mk(1000);
    expect(small.length).toBeLessThanOrEqual(MAX_CODE_CHARS);
    expect(decodeSave(small).portfolio.x.length).toBe(1000);
  });
  it('collectSave 与 encodeSave 同一份采集逻辑', () => {
    const s = fakeStore({
      scene2: true,
      planetsChapter: 3,
      endingAnswer: 'yes',
      portfolio: { boa: { strokes: ['M0,0'] } },
    });
    const data = collectSave(s);
    expect(data).toEqual(
      JSON.parse(Buffer.from(encodeSave(s).slice('B612-1-'.length), 'base64').toString('utf8'))
    );
    expect(data.scene2).toBe(1); // flag 在码里是 0/1
  });
  it('载入前快照走 collectSave+applySave,不受 decodeSave 钳位改写', () => {
    // 这条钉住"撤销上一次载入"为什么存**字段值**而不是存档码:
    // decodeSave 会把 str 截到 40 字符、num 夹到 0-99,拿码当撤销源会悄悄改掉玩家的原值。
    const long = 'x'.repeat(60);
    const s = fakeStore({ endingAnswer: long, planetsChapter: 7 });
    const snap = { at: 1, data: collectSave(s) };
    applySave(s, { endingAnswer: 'no', planetsChapter: 1 }); // 模拟导入把进度覆盖掉
    expect(s.str('endingAnswer')).toBe('no');
    applySave(s, snap.data); // 模拟撤销
    expect(s.str('endingAnswer')).toBe(long);
    expect(s.num('planetsChapter')).toBe(7);
    expect(decodeSave(encodeSave(s)).endingAnswer).toBe(long.slice(0, 40)); // 对照:码这条路确实会截
  });
  it('saveBackup 不进 SAVE_FIELDS(否则存档码里套存档码,每导一次翻一倍)', () => {
    expect(Object.keys(SAVE_FIELDS)).not.toContain('saveBackup');
  });
  // —— M-04(第六轮外部审计):写不进去必须说出来 ——
  it('applySave 全落盘时 ok:true、failed 空', () => {
    const r = applySave(fakeStore(), {
      scene2: true,
      planetsChapter: 3,
      endingAnswer: 'yes',
      portfolio: { a: 1 },
    });
    expect(r).toEqual({ ok: true, failed: [] });
  });
  it('setter 返回假值(0 / "" / null / undefined)不算写失败:只认严格 === false', () => {
    // 判定口径钉死在这里。若写成 `!ok`,setNum(k, 0) 这种"把赋值结果当返回值"的 setter
    // 会被当成失败 ⇒ 一次本来成功的载入被报成"存不下",玩家被拦在门外。
    const writes = [];
    const store = {
      mark: (k) => (writes.push(k), undefined),
      unmark: (k) => (writes.push(k), null),
      setNum: (k, v) => (writes.push(k), v), // planetsChapter:0 → 返回 0
      setStr: (k, v) => (writes.push(k), v), // endingAnswer:'' → 返回 ''
      setJson: (k, v) => (writes.push(k), v),
    };
    const r = applySave(store, {
      scene2: false,
      page1: true,
      planetsChapter: 0,
      endingAnswer: '',
      journeyMemories: {},
    });
    expect(writes).toEqual([
      'scene2',
      'page1',
      'planetsChapter',
      'endingAnswer',
      'journeyMemories',
    ]);
    expect(r.ok).toBe(true);
    expect(r.failed).toEqual([]);
  });
  it('某项没落盘时 failed 列出键名、ok:false(载入路径据此拒绝 reload)', () => {
    const store = {
      mark: () => true,
      unmark: () => true,
      setNum: (k) => (k === 'planetsChapter' ? false : true), // 模拟配额满时这一键写失败
      setStr: () => true,
      setJson: () => true,
    };
    expect(applySave(store, { scene2: true, planetsChapter: 3 })).toEqual({
      ok: false,
      failed: ['planetsChapter'],
    });
  });
  it('flag 清不掉(unmark 报错)同样计为失败', () => {
    const store = {
      mark: () => true,
      unmark: () => false,
      setNum: () => true,
      setStr: () => true,
      setJson: () => true,
    };
    expect(applySave(store, { scene2: false }).failed).toEqual(['scene2']);
  });
  // —— M-04:载入/撤销的落盘顺序。不可逆操作不许以"看起来像成功"收场 ——
  it('importSave:快照写不进 ⇒ noBackup,一个字段的现有进度都不覆盖', () => {
    const s = fakeStore({ scene2: true, planetsChapter: 5 });
    s.setJson = () => false; // localStorage 配额满 / 隐私模式
    expect(importSave(s, { scene2: false, planetsChapter: 9 })).toEqual({
      action: 'noBackup',
      failed: [],
    });
    expect(s.flag('scene2')).toBe(true);
    expect(s.num('planetsChapter')).toBe(5);
  });
  it('importSave:快照记的是载入**前**的进度(顺序反了就等于备份了新档)', () => {
    const s = fakeStore({ scene2: true, planetsChapter: 5 });
    expect(importSave(s, { planetsChapter: 9 }).action).toBe('reload');
    expect(s.num('planetsChapter')).toBe(9);
    expect(s.json('saveBackup', null).data.planetsChapter).toBe(5);
  });
  it('importSave:字段没全落盘 ⇒ partial,快照留着让玩家可以撤销', () => {
    const s = fakeStore({ scene2: true });
    const real = s.setNum;
    s.setNum = (k, v) => (k === 'planetsChapter' ? false : real(k, v));
    expect(importSave(s, { scene2: false, planetsChapter: 9 })).toEqual({
      action: 'partial',
      failed: ['planetsChapter'],
    });
    expect(s.json('saveBackup', null)).toBeTruthy();
  });
  it('restoreSave:撤到一半不清快照,撤成功才清(一次性)', () => {
    const s = fakeStore({ planetsChapter: 9 });
    const snap = { at: 1, data: { planetsChapter: 5 } };
    s.m.saveBackup = snap;
    const real = s.setNum;
    s.setNum = (k, v) => (k === 'planetsChapter' ? false : real(k, v));
    expect(restoreSave(s, snap)).toEqual({ action: 'partial', failed: ['planetsChapter'] });
    expect(s.json('saveBackup', null)).toBe(snap); // 重试依据还在
    s.setNum = real;
    expect(restoreSave(s, snap)).toEqual({ action: 'reload', failed: [] });
    expect(s.num('planetsChapter')).toBe(5);
    expect(s.json('saveBackup', null)).toBeNull();
  });
});
