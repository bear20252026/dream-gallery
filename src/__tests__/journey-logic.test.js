import { describe, it, expect } from 'vitest';
import {
  TASKS,
  cleanMemories,
  nearMemoryPoint,
  isAlmanacTime,
  formatMemoryTime,
} from '../shared/journey-logic.mjs';

describe('原著旅途交互边界', () => {
  it('B612 的家的回忆和国王观察不能跨世界完成', () => {
    const point = { x: 3, z: 4 },
      player = { x: 3, z: 4 };
    expect(nearMemoryPoint(point, player, 'main', 'b612')).toBe(false);
    expect(nearMemoryPoint(point, player, 'b612', 'king325')).toBe(false);
    expect(nearMemoryPoint(point, player, 'b612', 'b612')).toBe(true);
    expect(TASKS.almanac.world).toBe('king325');
  });
  it('必须真实走近观察点；飞行锁和缺失玩家禁止交互', () => {
    const point = { x: 0, z: 0 };
    expect(nearMemoryPoint(point, { x: 1.8, z: 0 }, 'b612', 'b612')).toBe(true);
    expect(nearMemoryPoint(point, { x: 1.81, z: 0 }, 'b612', 'b612')).toBe(false);
    expect(nearMemoryPoint(point, { x: 0, z: 0 }, 'b612', 'b612', true)).toBe(false);
    expect(nearMemoryPoint(point, null, 'b612', 'b612')).toBe(false);
  });
  it('历书只接受 19:40，不会误把“八点差二十分”算成 20:20', () => {
    expect(isAlmanacTime(1180)).toBe(true);
    expect(isAlmanacTime('1180')).toBe(true);
    expect(isAlmanacTime(1220)).toBe(false);
    expect(isAlmanacTime(1175)).toBe(false);
    expect(formatMemoryTime(1180)).toBe('19:40');
    expect(formatMemoryTime(undefined)).toBe('00:00');
  });
  it('旧档和损坏档不会重复奖励、注入未知记忆或反射用户文本', () => {
    expect(cleanMemories(null)).toEqual([]);
    expect(
      cleanMemories([
        { id: 'rose', choice: 2, text: '<script>' },
        { id: 'rose', choice: 0 },
        null,
        { id: '__proto__' },
        { id: 'almanac', choice: 99 },
      ])
    ).toEqual([
      { id: 'rose', choice: 2 },
      { id: 'almanac', choice: null },
    ]);
  });
});
