// planet-logic.test.js — B612 星球纯逻辑(章节数据/石门武装/返回外推/岛面几何)
// 回归锚点:2026-09-06「返回主世界黑屏」= 快照落点在石门圈内被再次传送 +
// 零向量外推失效;此两场景在此钉死。
import { describe, it, expect } from 'vitest';
import {
  PLANETS,
  WORLD_UNLOCK,
  ISLAND_R,
  ISLAND_TOP_K,
  GATE_POS,
  GATE_RADIUS,
  planetByNum,
  unlockedWorldIds,
  worldForIsland,
  spawnFor,
  kingSpawnPoint,
  islandTopAt,
  gateStep,
  exitGateNudge,
} from '../shared/planet-logic.mjs';

describe('章节数据完整性(与 spirits SPIRITS 同序同键的前提)', () => {
  it('六颗星球,编号 325..330 连续', () => {
    expect(PLANETS).toHaveLength(6);
    expect(PLANETS.map((p) => p.num)).toEqual(['325', '326', '327', '328', '329', '330']);
  });
  it('key 唯一且 WORLD_UNLOCK 与 PLANETS[1..5] 同序同键', () => {
    const keys = PLANETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(6);
    expect(WORLD_UNLOCK.map((w) => w.key)).toEqual(keys.slice(1));
    expect(WORLD_UNLOCK.map((w) => w.world)).toEqual([
      'king326',
      'king327',
      'king328',
      'king329',
      'king330',
    ]);
  });
  it('每颗星球文案四件套齐全(name/place/tts/en)', () => {
    for (const p of PLANETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.place).toContain(p.num);
      expect(p.tts.length).toBeGreaterThan(10);
      expect(p.en.length).toBeGreaterThan(0);
      expect(p.pos).toHaveLength(3);
    }
  });
});

describe('章节解锁链', () => {
  it('chapter=0/1 只开基础三世界', () => {
    expect(unlockedWorldIds(0)).toEqual(['main', 'b612', 'king']);
    expect(unlockedWorldIds(1)).toEqual(['main', 'b612', 'king']);
  });
  it('chapter=3 解锁前两颗(KING326/327);chapter≥6 全开', () => {
    expect(unlockedWorldIds(3)).toContain('king326');
    expect(unlockedWorldIds(3)).toContain('king327');
    expect(unlockedWorldIds(3)).not.toContain('king328');
    expect(unlockedWorldIds(6)).toEqual(
      expect.arrayContaining(['king326', 'king327', 'king328', 'king329', 'king330'])
    );
  });
  it('非法章节(负数/超大)不抛错', () => {
    expect(unlockedWorldIds(-2)).toEqual(['main', 'b612', 'king']);
    expect(unlockedWorldIds(99)).toHaveLength(8);
  });
});

describe('石门武装状态机(2026-09-06 黑屏回弹回归)', () => {
  it('圈外不触发并保持武装', () => {
    const far = gateStep(true, GATE_POS.x + 10, GATE_POS.z);
    expect(far).toEqual({ near: false, fire: false, armed: true });
  });
  it('武装状态进圈 → 触发一次并解除武装', () => {
    const step = gateStep(true, GATE_POS.x, GATE_POS.z);
    expect(step.near).toBe(true);
    expect(step.fire).toBe(true);
    expect(step.armed).toBe(false);
  });
  it('已解除武装时在圈内不再触发(返回落点在圈内的保护)', () => {
    const step = gateStep(false, GATE_POS.x + 1, GATE_POS.z);
    expect(step.near).toBe(true);
    expect(step.fire).toBe(false);
  });
  it('半径外一点(+0.01m)不算近(严格贴线是浮点敏感区,玩法落点不会精确停在线上)', () => {
    const step = gateStep(true, GATE_POS.x + GATE_RADIUS + 0.01, GATE_POS.z);
    expect(step.near).toBe(false);
  });
});

describe('返回落点外推 exitGateNudge(零向量回归)', () => {
  it('圈外坐标原样返回(moved=false)', () => {
    const r = exitGateNudge(GATE_POS.x + 20, GATE_POS.z - 5, GATE_RADIUS + 2);
    expect(r.moved).toBe(false);
    expect(r.x).toBe(GATE_POS.x + 20);
    expect(r.z).toBe(GATE_POS.z - 5);
  });
  it('圈内坐标沿来向推到圈外指定距离', () => {
    const r = exitGateNudge(GATE_POS.x + 1, GATE_POS.z, 6);
    expect(r.moved).toBe(true);
    expect(r.x).toBeCloseTo(GATE_POS.x + 6, 6);
    expect(r.z).toBeCloseTo(GATE_POS.z, 6);
  });
  it('与石门完全重合(零向量)时按默认方向 -z 退,不再原地踏步', () => {
    const r = exitGateNudge(GATE_POS.x, GATE_POS.z, 6);
    expect(r.moved).toBe(true);
    expect(r.x).toBeCloseTo(GATE_POS.x, 6);
    expect(r.z).toBeCloseTo(GATE_POS.z - 6, 6);
  });
  it('斜向进入时保持方向、只改模长', () => {
    const r = exitGateNudge(GATE_POS.x + 3, GATE_POS.z + 3, 6);
    expect(r.moved).toBe(true);
    expect(Math.hypot(r.x - GATE_POS.x, r.z - GATE_POS.z)).toBeCloseTo(6, 6);
  });
});

describe('岛面几何与出生点', () => {
  it('islandTopAt 命中岛心返回顶面高度,岛外返回 null', () => {
    const isl = PLANETS[0];
    expect(islandTopAt(isl.pos[0], isl.pos[2])).toBeCloseTo(isl.pos[1] + ISLAND_R * ISLAND_TOP_K, 6);
    expect(islandTopAt(isl.pos[0] + ISLAND_R + 5, isl.pos[2])).toBeNull();
  });
  it('spawnFor b612 用天幕壳内出生点;其余世界用 (0,2,12)', () => {
    const b = spawnFor('b612');
    expect(b.position).toEqual({ x: -1.5, y: 2, z: -8.5 });
    expect(b.onGround).toBe(true);
    const k = spawnFor('king325');
    expect(k.position).toEqual({ x: 0, y: 2, z: 12 });
  });
  it('kingSpawnPoint 站在岛面之上(>y 顶面且 z=4 距回程门 4m)', () => {
    const sp = kingSpawnPoint();
    expect(sp.y).toBeGreaterThan(ISLAND_R * ISLAND_TOP_K);
    expect(sp.z).toBe(4);
    expect(sp.onGround).toBe(true);
  });
  it('worldForIsland:主世界→b612,其余→king+编号', () => {
    expect(worldForIsland('main', '326')).toBe('b612');
    expect(worldForIsland('b612', '326')).toBe('king326');
  });
  it('planetByNum 命中与未命中', () => {
    expect(planetByNum('329').key).toBe('dawn');
    expect(planetByNum('999')).toBeNull();
  });
});
