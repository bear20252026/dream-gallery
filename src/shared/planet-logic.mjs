// planet-logic.mjs — B612 星球世界纯逻辑(2026-09-07 场景自动化:能"算账"的拆出来给测试)
// 零依赖、零 three、零 DOM:章节数据 / 岛面几何 / 石门武装状态机 / 返回落点外推。
// planets.js 只做场景接线(建模/灯光/世界注册),改数值来这里,改表现去 planets.js。

/* ===================== 几何常量 ===================== */
export const ISLAND_R = 13; // 岛半径(m)
export const ISLAND_TOP_K = 0.42; // 球体压扁系数:岛顶面 y = pos[1] + ISLAND_R * ISLAND_TOP_K
export const B612_SPAWN = { pos: [-1.5, 2, -8.5], yaw: Math.PI }; // 天幕壳内、星球正前方
export const GATE_POS = { x: 0.1, z: 56.0 }; // 主世界石门位置
export const GATE_RADIUS = 4; // 主世界石门自动传送半径(m)
export const PAD_RADIUS = 3; // 石台触发半径(m)
export const DOOR_RADIUS = 2.5; // 岛上回程门半径(m)
export const PICK_RADIUS = 3; // 星屑拾取半径(m)
export const kingSpawnY = () => ISLAND_R * ISLAND_TOP_K + 1.6; // 星球岛面站立高度

/* ===================== 六星章节数据(key 与 spirits SPIRITS 同序同键) ===================== */
// 剧情权限:完成当前星球后解锁下一颗;已解锁世界之间互相直达。顺序=原著行星(方案A)。
export const WORLD_UNLOCK = [
  { world: 'king326', key: 'flame', num: '326', name: '虚荣之星', done: 'flameDone' },
  { world: 'king327', key: 'leaf', num: '327', name: '酒鬼之星', done: 'leafDone' },
  { world: 'king328', key: 'snow', num: '328', name: '商人之星', done: 'snowDone' },
  { world: 'king329', key: 'dawn', num: '329', name: '点灯人之星', done: 'dawnDone' },
  { world: 'king330', key: 'dusk', num: '330', name: '地理学家之星', done: 'duskDone' },
];
export const PLANETS = [
  {
    key: 'sprout',
    num: '325',
    name: '国王之星',
    color: '#d9a441',
    veil: 'rgba(180,140,70,.14)',
    pos: [120, 58, -70],
    place: '325 号小行星 · 国王',
    tts: '国王的星球一无所有,他却统治一切。他命令太阳落下——只在日落允许的时刻。他说:审判自己,比审判别人难得多。能做到的人,寥寥无几。',
    popup: '拾获星屑 · 国王',
    en: 'The King',
  },
  {
    key: 'flame',
    num: '326',
    name: '虚荣之星',
    color: '#e8b8c8',
    veil: 'rgba(220,160,190,.13)',
    pos: [-240, 66, -150],
    place: '326 号小行星 · 爱虚荣的人',
    tts: '他听不见别的,只听得见赞美。你鼓一次掌,他敬一次礼。掌声给了他一顶帽子似的快乐,却从没给过他一个朋友。',
    popup: '拾获星屑 · 爱虚荣的人',
    en: 'The Conceited Man',
  },
  {
    key: 'leaf',
    num: '327',
    name: '酒鬼之星',
    color: '#9ab87a',
    veil: 'rgba(120,160,90,.14)',
    pos: [330, 74, 110],
    place: '327 号小行星 · 酒鬼',
    tts: '酒鬼坐在空荡荡的星球上喝酒。喝酒为了什么?为了忘记。忘记什么?忘记羞愧。羞愧什么?羞愧喝酒。有些被忘掉的,其实一直等着被找回来。',
    popup: '拾获星屑 · 酒鬼',
    en: 'The Tippler',
  },
  {
    key: 'snow',
    num: '328',
    name: '商人之星',
    color: '#c8a86a',
    veil: 'rgba(170,130,60,.15)',
    pos: [-400, 82, 90],
    place: '328 号小行星 · 商人',
    tts: '商人一辈子在数星星,数了五亿零一百万颗,把数字锁进抽屉,说星星都归他了。可他从来没有抬头看过它们一眼。拥有和看见,原来是两件事。',
    popup: '拾获星屑 · 商人',
    en: 'The Businessman',
  },
  {
    key: 'dawn',
    num: '329',
    name: '点灯人之星',
    color: '#a8c8e0',
    veil: 'rgba(140,170,210,.14)',
    pos: [200, 90, 330],
    place: '329 号小行星 · 点灯人',
    tts: '点灯人的星球一分钟自转一圈。他点亮,熄灭,再点亮,不敢停。他是唯一不为自己忙的人——小王子说,那是唯一可以交朋友的人。',
    popup: '拾获星屑 · 点灯人',
    en: 'The Lamplighter',
  },
  {
    key: 'dusk',
    num: '330',
    name: '地理学家之星',
    color: '#d0b090',
    veil: 'rgba(190,160,120,.15)',
    pos: [-190, 96, 400],
    place: '330 号小行星 · 地理学家',
    tts: '地理学家写厚厚的书,却从不出门。他说,花是转瞬即逝的,不能写进书里。小王子忽然心疼起来——他的玫瑰,也是转瞬即逝的。最后一根光柱,在天上。',
    popup: '拾获星屑 · 地理学家',
    en: 'The Geographer',
  },
];

/* ===================== 章节与世界链 ===================== */
export function planetByNum(num) {
  return PLANETS.find((p) => p.num === num) || null;
}
// 章节解锁的世界 id 列表(chapter=0..6,6=全部完成)
export function unlockedWorldIds(chapter) {
  return ['main', 'b612', 'king'].concat(
    WORLD_UNLOCK.slice(0, Math.max(0, chapter - 1)).map((w) => w.world)
  );
}
// 岛屿 travel 目标:主世界石门 → B612;B612/星球内 → 对应国王编号世界
export function worldForIsland(activeWorld, islandNum) {
  return activeWorld === 'main' ? 'b612' : 'king' + islandNum;
}

/* ===================== 出生点(普通对象;three 包装由 planets.js 做) ===================== */
export function spawnFor(targetWorld) {
  if (targetWorld === 'b612')
    return {
      position: { x: B612_SPAWN.pos[0], y: B612_SPAWN.pos[1], z: B612_SPAWN.pos[2] },
      yaw: B612_SPAWN.yaw,
      pitch: 0,
      vy: 0,
      onGround: true,
      gliding: false,
    };
  return { position: { x: 0, y: 2, z: 12 }, yaw: 0, pitch: 0, vy: 0, onGround: true, gliding: false };
}
export function kingSpawnPoint() {
  return { x: 0, y: kingSpawnY(), z: 4, yaw: 0, pitch: 0, vy: 0, onGround: true, gliding: false };
}

/* ===================== 岛面几何(主世界浮空岛地面判定) ===================== */
// 命中某座岛的正上方柱体 → 返回顶面 y;否则 null(调用方继续走 override 链)
export function islandTopAt(x, z) {
  for (let i = 0; i < PLANETS.length; i++) {
    const isl = PLANETS[i];
    const dx = x - isl.pos[0],
      dz = z - isl.pos[2];
    if (dx * dx + dz * dz < ISLAND_R * ISLAND_R) return isl.pos[1] + ISLAND_R * ISLAND_TOP_K;
  }
  return null;
}

/* ===================== 石门武装状态机(2026-09-06 黑屏根修的纯化) =====================
   armed=武装:只有"从圈外走进来"才触发自动传送;触发即解除。
   没有这门,从 B612 返回时快照把玩家放回圈内,下一帧又被弹回(黑屏回弹 bug)。 */
export function gateStep(armed, px, pz) {
  const dx = px - GATE_POS.x,
    dz = pz - GATE_POS.z;
  const near = dx * dx + dz * dz < GATE_RADIUS * GATE_RADIUS;
  if (!near) return { near: false, fire: false, armed: true };
  return { near: true, fire: !!armed, armed: false };
}

// 返回落点外推:把圈内坐标沿来向推出圈外 exitDist;与门重合(零向量)时按 defDir 退。
// 返回 moved=false 表示本就在圈外,坐标原样。
export function exitGateNudge(px, pz, exitDist, defDir) {
  const dir = defDir || [0, -1]; // 默认往画廊方向(-z)退
  const dx = px - GATE_POS.x,
    dz = pz - GATE_POS.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= exitDist) return { x: px, z: pz, moved: false };
  const ux = d > 0.01 ? dx / d : dir[0];
  const uz = d > 0.01 ? dz / d : dir[1];
  return { x: GATE_POS.x + ux * exitDist, z: GATE_POS.z + uz * exitDist, moved: true };
}
