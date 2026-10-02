import { describe, it, expect } from 'vitest';
import {
  allowJourneyDialog,
  guideBearing,
  memoryWalkPosition as kingWalkPosition,
  homeCheckpoint,
  kingCheckpoint,
} from '../shared/journey-guidance.mjs';

describe('一次只推进当前主线', () => {
  it('背景提示不能抢掉锁定的主线，包含主动求助对白', () => {
    expect(allowJourneyDialog({ lock: true }, { lock: false }, 'b612')).toBe(false);
    expect(allowJourneyDialog({ lock: true }, { userInitiated: true }, 'b612')).toBe(false);
    expect(allowJourneyDialog({ lock: true }, { lock: true, world: 'b612' }, 'b612')).toBe(true);
  });
  it('离开沙漠后旧数数/门口定时对白不能在国王星继续打开', () => {
    expect(allowJourneyDialog(null, { lock: true, world: 'main' }, 'king325')).toBe(false);
    expect(allowJourneyDialog(null, { lock: true, world: 'king325' }, 'king325')).toBe(true);
  });
  it('互动期间背景欢迎词保持安静，玩家帮助由独立弹层承接', () => {
    expect(allowJourneyDialog(null, {}, 'b612', true)).toBe(false);
    expect(allowJourneyDialog(null, { lock: true }, 'b612', true)).toBe(true);
  });
  it('正前方是向前，左右与转身指引符合实际移动轴', () => {
    const p = { p: { x: 0, z: 0 }, y: 0 };
    expect(guideBearing(p, { x: 0, z: -8 }).direction).toBe('forward');
    expect(guideBearing(p, { x: -8, z: 0 }).direction).toBe('left');
    expect(guideBearing(p, { x: 8, z: 0 }).direction).toBe('right');
    expect(guideBearing(p, { x: 0, z: 8 }).direction).toBe('behind');
    expect(guideBearing(p, { x: 0, z: 1.9 }).direction).not.toBe('arrived');
    expect(guideBearing(p, { x: 0, z: 1.8 }).direction).toBe('arrived');
  });
  it('朝向跨过±π时仍取短方向', () => {
    const p = { p: { x: 0, z: 0 }, y: Math.PI * 4 };
    expect(guideBearing(p, { x: 0, z: -8 }).angle).toBeCloseTo(0);
  });
  it('国王舞台不能飞出可探索区，B612曲面另由模型地表验收', () => {
    const king = kingWalkPosition({ x: 30, y: -50, z: 40 });
    expect(Math.hypot(king.x, king.z)).toBeCloseTo(12);
    expect(king.y).toBeCloseTo(7.06);
    expect(kingWalkPosition({ x: 0, y: 900, z: 9 }).z).toBe(9);
  });
  it('旧手札迁移只认连续完成的家的观察，不跳过未完成站', () => {
    expect(homeCheckpoint(0, [{ id: 'volcano' }, { id: 'baobab' }])).toBe(2);
    expect(homeCheckpoint(0, [{ id: 'rose' }])).toBe(0);
    expect(homeCheckpoint(-2, null)).toBe(0);
    expect(homeCheckpoint(200)).toBe(4);
  });
  it('国王已读完的段落不会在离开重入后全部重播', () => {
    expect(kingCheckpoint(1)).toBe(1);
    expect(kingCheckpoint(0, [{ id: 'almanac' }])).toBe(2);
    expect(kingCheckpoint(0, [{ id: 'rat' }])).toBe(4);
    expect(kingCheckpoint(500)).toBe(5);
  });
});
