// desert.js — 西域沙海入口:导入地形+大气,运行主循环
import { ctx } from '../ctx.js';
import { getH, assertAboveGround, updateChunks, waterU, water, KX, KZ } from './desert/terrain.js';
import { updateAtmosphere, dayNight, lastElev } from './desert/atmosphere.js';
import { currentMood } from './desert/light-mood.js'; // 氛围读数(诊断/探针,2026-11-12)
import { tickSandDetail } from './desert/sand-detail.js'; // 云影时间(2026-11-12 沙地细节)
import { tickFoliage } from './desert/foliage-life.js'; // 风时间(2026-11-13 植被风摆)

// ===================== 主更新循环 =====================
function update(dt, time) {
  // 地形区块
  updateChunks();
  // 沙地云影时间(程序化细节的慢漂移)
  tickSandDetail(time);
  // 植被风时间(2026-11-13 自然表面)
  tickFoliage(time);
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
ctx.media.desert = {
  getH,
  update,
  kunlun: { x: KX, z: KZ },
  dayNight,
  assertAboveGround,
  currentMood,
};
