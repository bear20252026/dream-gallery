// ctx-gallery-l2.test.js — gallery 域真拆(L2)的闸门(2026-11-20)
//
// L2 只动了两个属性,但形态很典型,值得钉住:
//  · zG(当前放大对象)原躺在 ctx.gallery 上,被 5 个文件 9 处直读。真拆后收进
//    src/gallery/painting-zoom.js 私有,只经 currentZoom()/isZoomed() 外泄。
//  · zoomIn 全仓无消费者(paintings.js 自己 import 直接用),是死挂载,直接删。
//
// 一旦回流(有人图省事再写 ctx.gallery.zG = …),真拆就白做了 —— 总线重新长回
// 那份状态,而 painting-zoom 的私有 zG 会与它不一致。所以这里钉三件事:
//   ① 全 src 不再出现这四个访问路径(命名空间 + 扁平别名层各两条);
//   ② painting-zoom.js 确实导出了那两个显式接口;
//   ③ ctx-gallery.js 的 properties 表里没有它们(代理上读到就是 undefined)。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function srcFiles(dir = 'src', acc = []) {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) {
      if (rel === 'src/__tests__' || rel === 'src/vendor') continue;
      srcFiles(rel, acc);
    } else if (/\.(js|mjs)$/.test(name)) acc.push(rel);
  }
  return acc;
}

describe('gallery 域真拆 L2', () => {
  it('① 全 src 不再出现 zG / zoomIn 的总线路径(命名空间 + 扁平别名层)', () => {
    const banned = [
      /\bctx\.gallery\.zG\b/,
      /\bctx\.gallery\.zoomIn\b/,
      /\bctx\.zG\b/,
      /\bctx\.zoomIn\b/,
    ];
    const hits = [];
    for (const rel of srcFiles()) {
      const src = read(rel);
      banned.forEach((re, i) => {
        if (re.test(src)) hits.push(`${rel} 命中第 ${i + 1} 条(${re})`);
      });
    }
    expect(hits, 'zG/zoomIn 又挂回总线了:\n' + hits.join('\n')).toEqual([]);
  });

  it('② painting-zoom.js 导出 currentZoom / isZoomed 两个显式接口', () => {
    const src = read('src/gallery/painting-zoom.js');
    expect(src, 'currentZoom 接口没了(锚点没命中)').toMatch(/export function currentZoom\s*\(/);
    expect(src, 'isZoomed 接口没了(锚点没命中)').toMatch(/export function isZoomed\s*\(/);
  });

  it('③ ctx-gallery.js 的 properties 表里没有 zG / zoomIn', () => {
    const src = read('src/ctx-gallery.js');
    const block = src.match(/const properties = \[([\s\S]*?)\];/);
    expect(block, 'properties 数组形状变了(锚点没命中)').not.toBeNull();
    expect(block[1]).not.toMatch(/['"]zG['"]/);
    expect(block[1]).not.toMatch(/['"]zoomIn['"]/);
  });

  it('④ 真拆的收益仍在:zG 的唯一 owner 是 painting-zoom.js', () => {
    // 写点必须全在 painting-zoom.js 里(私有 let zG),别处一个都不许有。
    const writers = [];
    for (const rel of srcFiles()) {
      if (/\bzG\s*=[^=]/.test(read(rel))) writers.push(rel);
    }
    expect(writers, 'zG 的写点必须只在 painting-zoom.js:').toEqual([
      'src/gallery/painting-zoom.js',
    ]);
  });
});
