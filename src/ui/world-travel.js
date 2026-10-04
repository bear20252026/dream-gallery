// ui/world-travel.js — 去某个世界的统一走法(章节地图与「旅途卡」共用)
// 按需先回沙漠、再进 B612、再进星球——与石门/导航按钮同一套世界切换,返回栈保持一致
// (星球里的回程石环 back() 回 B612,B612 的「返回沙漠」回主世界)。
import { ctx } from '../ctx.js';
import { spawnFor, kingSpawnPoint } from '../shared/planet-logic.mjs';
import { holdWarp, releaseWarp, lockWarpLabel } from '../shared/warp-fx.js';
import { warpDest } from '../shared/warp-labels.mjs';
import { tt } from '../shared/story-text.mjs';

/** @param {string} world 'main' | 'b612' | 'kingNNN';返回 false = 此刻不能走(切换中/飞行中) */
export async function travel(world) {
  const wm = ctx.scene.worldManager;
  if (!wm || wm.transitioning || ctx.kunlun.flightLock) return false;
  const cur = ctx.scene.activeWorld || 'main';
  if (world === cur) return true;
  // 多跳(沙漠 → B612 → 星球)只放一段星流:先托住夜幕、锁定最终目的地名,全部到达后统一淡出
  const d = warpDest(world);
  const label = d ? tt(d.label) : '';
  lockWarpLabel(label);
  await holdWarp(d ? { label, color: d.color } : {});
  try {
    return await hops(wm, world);
  } finally {
    lockWarpLabel(null);
    releaseWarp(380);
  }
}

async function hops(wm, world) {
  const cur = ctx.scene.activeWorld || 'main';
  // 星球 → 星球:先退回 B612(返回栈顶就是它),不必绕回沙漠
  if (/^king/.test(cur) && /^king/.test(world)) {
    const top = wm.worldStack[wm.worldStack.length - 1];
    if (top && top.id === 'b612') await wm.back();
  }
  const now = ctx.scene.activeWorld || 'main';
  if (now !== 'main' && !(world.startsWith('king') && now === 'b612'))
    await ctx.scene.toMainWorld?.();
  if (world === 'main') return true;
  if ((ctx.scene.activeWorld || 'main') === 'main') {
    await wm.enter('b612', { snapshot: { camera: null, player: spawnFor('b612') } });
  }
  if (world === 'b612') return true;
  const sp = kingSpawnPoint();
  return wm.enter(world, {
    snapshot: {
      camera: null,
      player: {
        position: { x: sp.x, y: sp.y, z: sp.z },
        yaw: sp.yaw,
        pitch: 0,
        vy: 0,
        onGround: true,
      },
    },
  });
}
