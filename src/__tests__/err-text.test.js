// err-text.test.js — loader onError 的未知错误值折成文本(2026-10-16 checkJs 第九刀)
//
// 这个模块存在的理由要先说清:`Loader.load(..., onError)` 的形参在 @types/three 里写着
// `(err: unknown) => void`(node_modules/@types/three/src/loaders/Loader.d.ts:39)—— three 自己
// 声明"这个值我不知道是什么"。而全仓曾有 14 处直接读 `e.message`,那是替 three 做断言。
// 所以本文件两件事:①把 `errText` 的分支逐个钉住(**含非 Error 那一支**,这才是换掉断言的正当理由,
// 不只是"少几条编译器错");②把"loader 失败分支不许再裸读 .message"做成全仓闸,防止下一个人顺手写回去。
//
// ⚠️读源码走 read():本机检出 CRLF,`\r` 会卡在 `$` 前面把 not.toMatch 变成空断言。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { errText } from '../shared/err-text.mjs';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const rel = `${d}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(rel);
    } else if (/\.(js|mjs)$/.test(e.name)) files.push(rel);
  }
};
walk('src');

describe('errText：把未知的失败值说成人话', () => {
  it('有 message 的 Error / 类 Error 对象 → 用 message', () => {
    expect(errText(new Error('出卷失败'))).toBe('出卷失败');
    expect(errText({ message: '裸对象也认' })).toBe('裸对象也认');
  });

  it('非 Error 那一支真的接得住(这是换掉断言的全部理由)', () => {
    // three 的 FileLoader 在网络层失败时交来的就是事件形状,没有 message
    expect(errText({ type: 'error', target: {} })).toBe('error');
    expect(errText('就是一个字符串')).toBe('就是一个字符串');
    expect(errText(null)).toBe('');
    expect(errText(undefined)).toBe('');
    // message 存在但不是字符串(有些库塞了对象)→ 不许变成 "[object Object]",退到 type / String
    expect(errText({ message: { nested: 1 }, type: 'abort' })).toBe('abort');
    expect(errText({ message: 42 })).toBe('42');
    expect(errText(404)).toBe('404');
  });

  it('永不为非字符串返回值(调用点是 console.warn 的参数,不能自己变成第二条异常)', () => {
    for (const v of [
      new Error('x'),
      { message: '' },
      { message: '', type: '' },
      {},
      [],
      0,
      '',
      false,
      Symbol('s'),
      () => {},
      Object.create(null), // 无原型对象:代码只读 o.message / o.type,不碰任何原型方法
    ]) {
      // 标签也别用 String(v):它对 Object.create(null) 自己就抛(第一版红在这里,红的是测试不是实现)。
      const label = Object.prototype.toString.call(v);
      expect(typeof errText(v), `返回值不是字符串:${label}`).toBe('string');
    }
  });
});

describe('loader 失败分支都走 errText,不再裸读 .message', () => {
  // 账本(第九刀实测):9 个文件 14 处。其中 5 处住在**不在 checkJs 程序集里**的文件
  // (`--listFiles` 实测 earth-day / ending-prince / scene10-fox / plane-flight / room/main.js 都不在 ——
  // A 批把那 7 个世界模块从 main.js 的静态 import 挪进 preloadWorld() 之后,它们就退出了检查图,
  // 而 main.js 自己不是 include 根)⇒ 编译器一条错都没报过,这一族真实是 14 不是 9。
  // 这正是档案里那条"没报错不等于没人用/没写错"的第 N 个实例,也是这条静态闸存在的理由。
  const LEDGER = {
    'src/gallery/crash-site.js': 1,
    'src/gallery/dome-towers.js': 1,
    'src/kunlun/earth-day.js': 1,
    'src/kunlun/ending-prince.js': 1,
    'src/kunlun/planets.js': 3,
    'src/kunlun/scene10-fox.js': 1,
    'src/kunlun/scene7-tippler.js': 4,
    'src/room/main.js': 1,
    'src/scene/plane-flight.js': 1,
  };
  const MOD = 'src/shared/err-text.mjs';

  it('账本逐点对上(新增一处要同时进表,少一处也要红)', () => {
    const ledger = {};
    for (const rel of files) {
      if (rel === MOD) continue;
      const n = (read(rel).match(/errText\(/g) || []).length;
      if (n) ledger[rel] = n;
    }
    expect(ledger).toEqual(LEDGER);
  });

  it('用了 errText 的文件必须 import 它(缺 import 是运行期 ReferenceError,构建不报)', () => {
    for (const rel of Object.keys(LEDGER)) {
      expect(read(rel), `${rel} 缺 import`).toContain("from '../shared/err-text.mjs'");
    }
  });

  it('箭头形 onError 回调上不许再出现裸 `.message` 读法', () => {
    // ⚠️判据按**行**扫,不用跨行惰性量词:第一版写成 `[^;]{0,160}?` / `[\s\S]{0,200}?`,
    // 在 218 个文件上要 46 秒(整套 vitest 直接被拖到超时被杀),按行改完是 1.7 秒。
    const arrow = /\(\s*(e|err|errOrEvent)\s*\)\s*=>[^\n]*\b\1\.message\b/;
    const bad = [];
    for (const rel of files) {
      if (rel === MOD) continue;
      read(rel)
        .split('\n')
        .forEach((L, i) => {
          if (arrow.test(L)) bad.push(`${rel}:${i + 1} ${L.trim().slice(0, 80)}`);
        });
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
