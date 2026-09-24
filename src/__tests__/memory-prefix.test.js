// memory-prefix.test.js — 画作配文前缀幂等契约(2026-09-24 大文件抽缝批)
// 回归锚点:前缀不幂等则 HMR 重载/重复调用会叠成「B612 替你记得：B612 替你记得：…」
import { describe, it, expect } from 'vitest';
import { MEMORY_PREFIX, withMemoryPrefix } from '../shared/memory-prefix.mjs';

describe('withMemoryPrefix 幂等', () => {
  it('裸文本加前缀', () => {
    expect(withMemoryPrefix('夕阳很好。')).toBe(MEMORY_PREFIX + '夕阳很好。');
  });
  it('已带前缀的原样返回(叠两次=回归)', () => {
    const once = withMemoryPrefix('夕阳很好。');
    expect(withMemoryPrefix(once)).toBe(once);
  });
  it('前缀常量不被误改', () => {
    expect(MEMORY_PREFIX).toBe('B612 替你记得：');
  });
  it('空值兜底:空串/undefined 给纯前缀,不产出 undefined 字样', () => {
    expect(withMemoryPrefix('')).toBe(MEMORY_PREFIX);
    expect(withMemoryPrefix(undefined)).toBe(MEMORY_PREFIX);
  });
});
