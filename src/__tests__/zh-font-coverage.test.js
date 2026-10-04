// zh-font-coverage.test.js — 中文剧情字体子集必须覆盖全部剧情台词(2026-10-03)
// 背景:2026-09-07 的志莽行书子集只有 318 字,后写的台词大量缺字,
// 一句话里半行书半系统字体(测试反馈)。改了台词却忘了重做子集时,这里会报错:
//   python scripts/gen/subset-zh-font.py <ZhiMangXing-Regular.ttf>
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import * as STORY from '../shared/story-text.mjs';
import * as ENDING from '../shared/ending-text.mjs';
import * as JOURNEY from '../shared/journey-logic.mjs';
import * as PLANETS from '../shared/planet-logic.mjs';
import * as LATE from '../shared/story-text-late.mjs';

const FONT = fileURLToPath(new URL('../styles/fonts/ZhiMangXing-sub.woff2', import.meta.url));
// 完整字体本身就没有的字(只能回退系统字体),不算子集的错
const NOT_IN_FULL_FONT = new Set([...'稊窣窸茀·']);

/** 读 WOFF2 的 cmap(只解析目录 + brotli 解压,不依赖第三方库) */
function woff2Codepoints(file) {
  const b = fs.readFileSync(file);
  const KNOWN = [
    'cmap',
    'head',
    'hhea',
    'hmtx',
    'maxp',
    'name',
    'OS/2',
    'post',
    'cvt ',
    'fpgm',
    'glyf',
    'loca',
    'prep',
    'CFF ',
    'VORG',
    'EBDT',
    'EBLC',
    'gasp',
    'hdmx',
    'kern',
    'LTSH',
    'PCLT',
    'VDMX',
    'vhea',
    'vmtx',
    'BASE',
    'GDEF',
    'GPOS',
    'GSUB',
    'EBSC',
    'JSTF',
    'MATH',
    'CBDT',
    'CBLC',
    'COLR',
    'CPAL',
    'SVG ',
    'sbix',
    'acnt',
    'avar',
    'bdat',
    'bloc',
    'bsln',
    'cvar',
    'fdsc',
    'feat',
    'fmtx',
    'fvar',
    'gvar',
    'hsty',
    'just',
    'lcar',
    'mort',
    'morx',
    'opbd',
    'prop',
    'trak',
    'Zapf',
    'Silf',
    'Glat',
    'Gloc',
    'Feat',
    'Sill',
  ];
  let o = 12;
  const numTables = b.readUInt16BE(o);
  o = 48;
  const base128 = () => {
    let r = 0;
    for (let i = 0; i < 5; i++) {
      const c = b[o++];
      r = (r << 7) | (c & 0x7f);
      if (!(c & 0x80)) return r >>> 0;
    }
    return r >>> 0;
  };
  const tabs = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[o++];
    let tag;
    if ((flags & 63) === 63) {
      tag = b.slice(o, o + 4).toString();
      o += 4;
    } else tag = KNOWN[flags & 63];
    const ver = (flags >> 6) & 3;
    const orig = base128();
    let len = orig;
    const glyfLoca = tag === 'glyf' || tag === 'loca';
    if ((glyfLoca && ver === 0) || (!glyfLoca && ver !== 0)) len = base128();
    tabs.push({ tag, len });
  }
  const data = zlib.brotliDecompressSync(b.slice(o));
  let off = 0,
    cmap = null;
  for (const t of tabs) {
    if (t.tag === 'cmap') cmap = data.slice(off, off + t.len);
    off += t.len;
  }
  const set = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const so = cmap.readUInt32BE(4 + i * 8 + 4);
    const fmt = cmap.readUInt16BE(so);
    if (fmt === 4) {
      const seg = cmap.readUInt16BE(so + 6) / 2;
      const ends = so + 14,
        starts = ends + seg * 2 + 2;
      for (let s = 0; s < seg; s++) {
        const e = cmap.readUInt16BE(ends + s * 2),
          st = cmap.readUInt16BE(starts + s * 2);
        for (let c = st; c <= e && c !== 0xffff; c++) set.add(c);
      }
    } else if (fmt === 12) {
      const ng = cmap.readUInt32BE(so + 12);
      for (let g = 0; g < ng; g++) {
        const st = cmap.readUInt32BE(so + 16 + g * 12),
          e = cmap.readUInt32BE(so + 20 + g * 12);
        for (let c = st; c <= e; c++) set.add(c);
      }
    }
  }
  return set;
}

/** 递归收集导出数据里的所有字符串 */
function strings(v, out = [], seen = new Set()) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object' && !seen.has(v)) {
    seen.add(v);
    for (const k of Object.keys(v)) strings(v[k], out, seen);
  }
  return out;
}

describe('中文剧情字体子集覆盖全部台词', () => {
  const have = woff2Codepoints(FONT);
  it('子集确实是一个像样的字表(不是旧的 318 字)', () => {
    expect(have.size).toBeGreaterThan(1000);
  });
  for (const [name, mod] of [
    ['story-text', STORY],
    ['ending-text', ENDING],
    ['journey-logic', JOURNEY],
    ['planet-logic', PLANETS],
    ['story-text-late', LATE],
  ]) {
    it(name + ' 的每个汉字都在字体里', () => {
      const missing = new Set();
      for (const s of strings(mod))
        for (const ch of s) {
          const c = ch.codePointAt(0);
          if (c >= 0x4e00 && c <= 0x9fff && !have.has(c) && !NOT_IN_FULL_FONT.has(ch))
            missing.add(ch);
        }
      // 缺字时提示:python scripts/gen/subset-zh-font.py <ZhiMangXing-Regular.ttf>
      expect([...missing].join('')).toBe('');
    });
  }
});
