// planet-radius-single-source.test.js — 第六轮审计 M-07「stardust」条的落地判据(2026-10-15)
// 核实结论:四颗星把「走到 3m 内 ⇒ 拾取/回程」各写了一遍字面量 9(=3²),而 planet-logic 里
// 早就备好的 PICK_RADIUS **一处都没被引用**(DOOR_RADIUS 还写着 2.5,与现实 3m 不符)。
// 真正的病不是那 12 行仪式(三份 tryPickup/tryDoorTeleport 逐行 diff 过,除场景名与日志前缀外**行为一致**,
// 合并需要每章注入 4~5 个回调,收益为负),而是**这个调过的数会各章漂移**(325 星屑因 3m 圈离出生点太近被挪过位)。
// 所以收成单一源:半径只在 planet-logic 定义,四章 import;本测试钉住"不许再写字面量"。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PICK_RADIUS, DOOR_RADIUS } from '../shared/planet-logic.mjs';

const ROOT = path.resolve(__dirname, '..', '..');
const CHAPTERS = [
  'src/kunlun/scene6-king.js',
  'src/kunlun/scene7-vanity.js',
  'src/kunlun/scene7-tippler.js',
  'src/kunlun/late-planets.js',
];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('星屑拾取/回程石环半径的单一源', () => {
  it('数值就是剧情调过的那个 3m(325 星屑因拾取圈太靠近出生点被整体挪位,别顺手改小改大)', () => {
    expect(PICK_RADIUS).toBe(3);
    expect(DOOR_RADIUS).toBe(3);
  });

  it('四章都从 planet-logic 取半径', () => {
    for (const rel of CHAPTERS) {
      const t = read(rel);
      expect(t, rel).toMatch(
        /import\s*\{[^}]*PICK_RADIUS[^}]*\}\s*from\s*'\.\.\/shared\/planet-logic\.mjs'/
      );
      expect(t, rel).toMatch(
        /import\s*\{[^}]*DOOR_RADIUS[^}]*\}\s*from\s*'\.\.\/shared\/planet-logic\.mjs'/
      );
    }
  });

  it('判定式里不许再出现字面量半径(距离平方比较与 near() 第三参)', () => {
    const offenders = [];
    for (const rel of CHAPTERS) {
      const t = read(rel);
      if (/dz \* dz [<>]=? \d/.test(t)) offenders.push(rel + ' (dx*dx+dz*dz < 字面量)');
      if (/near\([^)]*,\s*\d+\s*\)/.test(t)) offenders.push(rel + ' (near(..., 字面量))');
    }
    expect(offenders).toEqual([]);
  });

  it('四章拾取/回程仍各判一次(仪式未合并是**决定**,不是漏做:改这里先看文件头)', () => {
    expect(CHAPTERS.filter((rel) => /PICK_RADIUS \* PICK_RADIUS/.test(read(rel)))).toHaveLength(4);
    expect(CHAPTERS.filter((rel) => /DOOR_RADIUS \* DOOR_RADIUS/.test(read(rel)))).toHaveLength(4);
  });
});
