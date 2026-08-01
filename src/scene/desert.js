// desert.js — 西域沙海入口:导入地形+大气,运行主循环
import { ctx } from '../ctx.js';
import { getH, assertAboveGround, updateChunks, waterU, water, KX, KZ } from './desert/terrain.js';
import { updateAtmosphere, dayNight, lastElev } from './desert/atmosphere.js';

// ===================== 主更新循环 =====================
function update(dt, time) {
  // 地形区块
  updateChunks();
  // 水面跟随玩家
  waterU.uTime.value = time;
  if (ctx.player.pl) {
    water.position.x += (ctx.player.pl.p.x - water.position.x) * dt * 2;
    water.position.z += (ctx.player.pl.p.z - water.position.z) * dt * 2;
    waterU.uOffset.value.set(water.position.x, water.position.z);
  }
  // 大气效果(飞鸟/沙暴/云团/风行/灯塔/罗盘/HUD)
  updateAtmosphere(dt, time);
}

// ===================== 导出 =====================
ctx.media.desert = { getH, update, kunlun: { x: KX, z: KZ }, dayNight, assertAboveGround };
