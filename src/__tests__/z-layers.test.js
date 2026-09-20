// z-layers.test.js — z-index 登记册契约(2026-09-18 审计 P1 补测)
// 守三条:①全为正整数;②引导链/过渡链单调不倒挂;③关键覆盖关系锁死(防层级回归)。
import { describe, it, expect } from 'vitest';
import Z, { Z as ZNamed } from '../shared/z-layers.mjs';

describe('z-layers 登记册', () => {
  it('全部键为有限正整数', () => {
    for (const [k, v] of Object.entries(Z)) {
      expect(Number.isInteger(v), k).toBe(true);
      expect(v, k).toBeGreaterThan(0);
      expect(v, k).toBeLessThan(1000000);
    }
  });
  it('引导链单调:gateDoc < loading < gate < prologue < film', () => {
    expect(Z.gateDoc).toBeLessThan(Z.loading);
    expect(Z.loading).toBeLessThan(Z.gate);
    expect(Z.gate).toBeLessThan(Z.prologue);
    expect(Z.prologue).toBeLessThan(Z.film);
  });
  it('过渡链单调:modal < veilFx < veilLock < teleport;HUD < questBook < guideCard < menuBtn', () => {
    expect(Z.modal).toBeLessThan(Z.veilFx);
    expect(Z.veilFx).toBeLessThanOrEqual(Z.veilLock);
    expect(Z.veilLock).toBeLessThan(Z.teleport);
    expect(Z.hudLow).toBeLessThan(Z.questBook);
    expect(Z.questBook).toBeLessThan(Z.guideCard);
    expect(Z.guideCard).toBeLessThan(Z.menuBtn);
  });
  it('系统层最高:kickNotice < exitFade < errTrap;且高于一切业务层', () => {
    expect(Z.kickNotice).toBeLessThan(Z.exitFade);
    expect(Z.exitFade).toBeLessThan(Z.errTrap);
    const maxBiz = Math.max(Z.film, Z.teleport, Z.worldToast, Z.quizPanel);
    expect(Z.kickNotice).toBeGreaterThan(maxBiz);
  });
  it('小地图罗盘与菜单键的相对关系锁死(2026-09-10 圆形改造)', () => {
    expect(Z.mapPanel).toBeGreaterThanOrEqual(Z.hudLow);
    expect(Z.mapBtn).toBeGreaterThan(Z.mapPanel);
    expect(Z.mapBtn).toBeLessThan(Z.questBook); // 不得盖任务册
  });
  it('默认导出与具名导出同一对象(两种 import 用法兼容)', () => {
    expect(ZNamed).toBe(Z);
  });
});
