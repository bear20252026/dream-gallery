// late-planets-visit.test.js — “每次进入都是一条世代”这件事在 late-planets 里真的接线了(2026-10-17 C4)
//
// 机制本身由 visit-timers.test.js 用真计时器验(九条契约)。本文件只管**接线**:
// 三颗星的玩法与流程散在 600 行场景代码里,最容易发生的漂移是"某处又写了裸 setTimeout"或
// "判活重新看回模块级全局 gameEl" —— 这两种都不会报错,只会让快返时的旧尾巴复活。
// 所以每条判据都**剥注释后**读源码(注释里必然要复述旧写法,不剥就是判据把自己的说明数成违规,
// 这条本仓已记过四次),并且"解析不到就抛错",不静默通过。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const F = 'src/kunlun/late-planets.js';
const src = fs.readFileSync(path.join(ROOT, F), 'utf8').replace(/\r\n/g, '\n');
// 剥注释(与 types-param-bag-shapes.test.js / gentle-panel-wiring.test.js 同一写法)
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

/** 取某个函数从声明行到"下一个同缩进的顶层 function/const"的片段 */
function fnBody(name) {
  const at = code.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('找不到函数 ' + name + '(改名了?判据要跟着改,不许放宽)');
  const rest = code.slice(at + 1);
  const m = rest.match(/\n(?:function |const |ctx\.onTick)/);
  if (!m) throw new Error(name + ' 的结尾锚点找不到(文件结构变了?)');
  return code.slice(at, at + 1 + m.index);
}

describe('late-planets 的世代接线', () => {
  it('全流程零裸计时器:setTimeout / setInterval 一律不许出现在代码里', () => {
    const hits = [...code.matchAll(/\bset(Timeout|Interval)\s*\(/g)].map((m) => m[0]);
    expect(hits, '漂回了裸计时器(旧世代的尾巴会拆新面板/推双份剧情):' + hits.join(',')).toEqual([]);
    expect(code).toMatch(/clearTimeout\(/); // 机制仍在用(换世即清),不判假空断言
  });

  // 扫全仓的用例天然顶到 vitest 默认 20s 超时(并发时更明显)——本仓记过三次,新写就带上预算
  it('延时只有一个出处:shared/visit-timers.mjs(不许再造第二份世代实现)', () => {
    expect(code).toMatch(/from '\.\.\/shared\/visit-timers\.mjs'/);
    const clock = fs.readFileSync(path.join(ROOT, 'src/shared/visit-timers.mjs'), 'utf8');
    expect(clock).toMatch(/export function createVisitClock/);
    expect(clock).toMatch(/function later\(/);
    expect(clock).toMatch(/function every\(/);
    // 全仓只此一处实现世代时钟(第二份 = 两套"我还活着吗"的判据,正是 M-10 那一族)
    const users = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = d + '/' + e.name;
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(rel);
        } else if (
          /\.(js|mjs)$/.test(e.name) &&
          /createVisitClock/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
        ) {
          users.push(rel.replace(/\\/g, '/'));
        }
      }
    };
    walk('src');
    expect(users.sort()).toEqual(['src/kunlun/late-planets.js', 'src/shared/visit-timers.mjs']);
  }, 60_000);

  it('每个会异步收尾的作用域都取了自己的世代号', () => {
    for (const fn of ['businessGame', 'lampGame', 'geoGame', 'begin']) {
      expect(fnBody(fn), fn + ' 没有取 visits.gen(world) ⇒ 它的延时无法判世').toMatch(
        /visits\.gen\(world\)/
      );
    }
  });

  it('★ 329 的判活看"本轮那块面板还在不在 DOM",不再看模块级全局 gameEl', () => {
    const body = fnBody('lampGame');
    expect(body).toMatch(/!el\.isConnected/);
    expect(
      body,
      '判活又回到全局 gameEl:重进后 gameEl 被新面板赋值,旧 interval 永不停止'
    ).not.toMatch(/!gameEl/);
    // 双保险:interval 由世代时钟持有(换世真停止),不是靠回调自己早退
    expect(body).toMatch(/visits\.every\(\s*world,\s*gen,\s*flip/);
  });

  it('★ 路灯控制权有"离场也归还"这条路(旧写法只有通关那条,中途离开就永久残留 manual)', () => {
    const body = fnBody('lampGame');
    expect(body).toMatch(/visits\.onLeave\(/);
    expect(body).toMatch(/manual\s*=\s*false/);
    expect(body).toMatch(/manual\s*=\s*true/);
  });

  it('离场即换世,且不管这颗星是否已完成', () => {
    const tick = code.slice(code.indexOf('ctx.onTick('));
    expect(tick).toMatch(/visits\.bump\(prevWorld\)/);
    const at = tick.indexOf('visits.bump(prevWorld)');
    const gate = tick.indexOf('if (!s.done)');
    expect(at, 'bump 必须在 if 之前(已完成那颗也可能有上一世的尾巴)').toBeLessThan(gate);
  });

  it('台词队列不再共用一只模块级 speakTimer(三星共用 = 互相摘心跳)', () => {
    expect(code).not.toMatch(/\bletspeakTimer\b|let speakTimer\b/);
    expect(fnBody('speakSeq')).toMatch(/visits\.later\(/);
    expect(fnBody('speakSeq')).toMatch(/visits\.alive\(\s*home,\s*gen\s*\)/);
  });

  it('探针读数把世代与在飞计时器暴露出来(实机验收要能读到,不许只靠肉眼看画面)', () => {
    expect(code).toMatch(/gen:\s*visits\.gen\(w\)/);
    expect(code).toMatch(/pending:\s*visits\.pending\(w\)/);
  });
});
