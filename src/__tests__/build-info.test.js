// build-info.test.js — 版本戳文字(2026-10-03)
import { describe, it, expect } from 'vitest';
import { buildInfo, versionLine } from '../shared/build-info.mjs';

describe('version line', () => {
  it('英文/中文格式', () => {
    const b = { n: 214, hash: 'abc1234', date: '2026-10-03' };
    expect(versionLine(b, 'en')).toBe('Updated Oct 3, 2026 · v1.214');
    expect(versionLine(b, 'zh')).toBe('更新于 2026-10-03 · v1.214');
  });
  it('没有构建戳时显示 dev', () => {
    expect(versionLine(null, 'en')).toBe('dev build');
    expect(versionLine(null, 'zh')).toBe('开发版');
  });
  it('源码直跑(无 define)时 buildInfo 为 null 或真实戳', () => {
    const b = buildInfo();
    expect(b === null || typeof b.n === 'number').toBe(true);
  });
});
