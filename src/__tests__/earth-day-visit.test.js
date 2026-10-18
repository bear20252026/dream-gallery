// earth-day-visit.test.js — 沙漠「地球之日」那条台词链真的归世代了(2026-10-17 收 C4 同形状的最后一处)
//
// 机制本身仍由 `visit-timers.test.js` 用真计时器验;本文件只管**接线**,与 `late-planets-visit.test.js` 同规:
// 每条都**剥注释后**读源码(注释里必然要复述旧写法 —— 这条本仓已记过五次),取不到锚点就**抛错**,
// 不静默通过。地球之日这几处的漂移形状各不一样,所以一条一个判据:
//  · 裸 setTimeout 回来 ⇒ 旧世心跳又活了(玩家回来之后它替旧世 finish,earthStep 一步跳两站)
//  · `after` 的世代闸被摘 ⇒ **foxApi 那一路**的旧世回调照样推进进度,而世代时钟管不到别的模块的计时器
//  · 离场分支的 bump 被挪到 return 之后 ⇒ 一句都不执行,判据却还看着"接线在"
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const F = 'src/kunlun/earth-day.js';
const src = fs.readFileSync(path.join(ROOT, F), 'utf8').replace(/\r\n/g, '\n');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

/** 取某个顶层函数从声明行到"下一个同缩进的顶层 function/const"的片段 */
function fnBody(name) {
  const at = code.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('找不到函数 ' + name + '(改名了?判据要跟着改,不许放宽)');
  const rest = code.slice(at + 1);
  const m = rest.match(/\n(?:function |const |ctx\.onTick)/);
  if (!m) throw new Error(name + ' 的结尾锚点找不到(文件结构变了?)');
  return code.slice(at, at + 1 + m.index);
}

/** 取离场分支那一段(从 `if (!inDesert()) {` 起,够长即可,后面的 return 是它的) */
function leaveBlock() {
  const at = code.indexOf('if (!inDesert()) {');
  if (at < 0)
    throw new Error('找不到离场分支 `if (!inDesert()) {`(判定写法换了?判据跟着改,不许放宽)');
  return code.slice(at, at + 600);
}

describe('地球之日的世代接线', () => {
  it('全流程零裸计时器:setTimeout / setInterval 一律不许出现在代码里', () => {
    const hits = [...code.matchAll(/\bset(Timeout|Interval)\s*\(/g)].map((m) => m[0]);
    expect(hits, '漂回了裸计时器 ⇒ 旧世那条心跳没人摘:' + hits.join(',')).toEqual([]);
    expect(code, '机制仍在用(这句收完就收回自己的心跳),防"恒空的假断言"').toMatch(
      /visits\.cancel\(/
    );
  });

  it('台词链取世、判世、心跳归这一世(不再共用模块级单槽)', () => {
    const b = fnBody('speakSeq');
    expect(b).toMatch(/visits\.gen\('main'\)/);
    expect(b).toMatch(/visits\.alive\(\s*'main',\s*gen\s*\)/);
    expect(b).toMatch(/visits\.later\(\s*\n?\s*'main',\s*\n?\s*gen,/);
    expect(
      b,
      '心跳又漂回模块级 speakTimer:同一条链的上一拍会被下一拍摘掉,而离场时谁都不摘'
    ).toMatch(/visits\.cancel\(\s*\n?\s*'main',\s*beat\s*\)/);
    // ★单独钉这一条,因为它红过一次(2026-10-17 探针 ⑤ 实测走完一站后 `pending=2`):
    //   裸 `clearTimeout(beat)` 确实让回调不跑了,但**不摘 `s.timers` 里的句柄** ⇒ `pending()`
    //   从"还有几个在飞"退化成"登记过几个没到期的",一长条链(蛇站 19 句)能把集合越填越满,
    //   而探针与 `earthDayApi.state()` 的读数就是给验收用的,读数说谎等于没有读数。
    expect(b, '摘本世代的登记一律走 visits.cancel;裸 clearTimeout 不摘集合').not.toMatch(
      /clearTimeout\(/
    );
    expect(code, '模块级单槽不许回来').not.toMatch(/let speakTimer\b/);
  });

  it('★ 到站收尾有世代闸:foxApi 那一路的旧世回调不许推进这一世的 earthStep', () => {
    const b = fnBody('arrive');
    expect(b, 'arrive 没取世代号 ⇒ after 无从判世').toMatch(/const gen = visits\.gen\('main'\)/);
    expect(
      b,
      'after 变成裸 `() => advance()` ⇒ 狐狸站(scene10-fox 自持计时器)的旧世收尾会多推一步'
    ).toMatch(/if \(!visits\.alive\('main', gen\)\) return;\s*\n?\s*advance\(\);/);
  });

  it('★ 离场即换世,而且这句真的会被执行到(bump 在该分支的 return 之前)', () => {
    const blk = leaveBlock();
    const bump = blk.indexOf("visits.bump('main')");
    const ret = blk.indexOf('return;');
    expect(
      bump,
      '离场分支里没有换世 ⇒ 旧世延时只是"到点了先不动",回来照样跑'
    ).toBeGreaterThanOrEqual(0);
    expect(ret, '离场分支结构变了(找不到那句 return)').toBeGreaterThan(-1);
    expect(bump, 'bump 挪到 return 之后 = 一句永远执行不到的接线').toBeLessThan(ret);
  });

  it('拆装配也换世(dispose 之后不该还有沙漠那一世的回调在飞)', () => {
    const at = code.indexOf('dispose() {');
    if (at < 0) throw new Error('找不到 dispose(结构变了?)');
    expect(
      code.slice(at, at + 260),
      'dispose 又只 clearTimeout 一只单槽 ⇒ 换世没发生,旧世其余在飞的东西照跑'
    ).toMatch(/dispose\(\)\s*\{\s*\n\s*visits\.bump\('main'\);/);
  });

  it('在场这一半没有被"世代"顺手替掉:时钟的 here 注的就是 inDesert(读 activeWorld)', () => {
    expect(code, '世代时钟的在场判定不许写成恒真(那等于把 M-03 那一半拆了)').toMatch(
      /createVisitClock\(inDesert\)/
    );
    expect(fnBody('inDesert')).toMatch(/activeWorld \|\| 'main'\)\s*===\s*'main'/);
  });

  it('探针读数暴露 gen 与 pending(实机验收要读得到,不许只靠肉眼看画面)', () => {
    expect(code).toMatch(/gen:\s*visits\.gen\('main'\)/);
    expect(code).toMatch(/pending:\s*visits\.pending\('main'\)/);
  });
});
