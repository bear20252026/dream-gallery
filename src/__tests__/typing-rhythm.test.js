// typing-rhythm.test.js — 打字机节奏纯函数契约(2026-09-24 剧情流畅度)
// 回归锚点:①标点驻留被误改成恒速(机关枪感回归);②普通字节奏被改到影响历史手感。
import { describe, it, expect } from 'vitest';
import { dwellFor, BASE_MS, WEAK_MS, STRONG_MS } from '../shared/typing-rhythm.mjs';

describe('dwellFor 打字节奏', () => {
  it('普通字符(中英文/数字/空格)走基础节奏', () => {
    for (const ch of ['画', 'a', 'B', '6', ' ', '1']) expect(dwellFor(ch)).toBe(BASE_MS);
  });
  it('弱标点(，、；：)轻顿', () => {
    for (const ch of ['，', '、', '；', '：']) expect(dwellFor(ch)).toBe(WEAK_MS);
  });
  it('强标点(。！？…—)重顿', () => {
    for (const ch of ['。', '！', '？', '…', '—']) expect(dwellFor(ch)).toBe(STRONG_MS);
  });
  it('空/undefined 兜底基础节奏', () => {
    expect(dwellFor('')).toBe(BASE_MS);
    expect(dwellFor(undefined)).toBe(BASE_MS);
  });
  it('节奏阶梯:基础 < 弱顿 < 重顿(呼吸感成立)', () => {
    expect(BASE_MS).toBeLessThan(WEAK_MS);
    expect(WEAK_MS).toBeLessThan(STRONG_MS);
  });
});
