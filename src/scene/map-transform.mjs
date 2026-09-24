// map-transform.mjs — 建筑区坐标变换(2026-09-24 自 minimap.js 抽出,点图传送单一源)
// 玩家坐标 ↔ 羊皮纸罗盘图面像素。zone(x∈[-34,34], z∈[-13,60] 中心 z=23.5)的外沿角
// 正好落在圆周上:S=w/100。传送(player.js 点图)与绘制(minimap.js)统一走这两个函数,
// 永不再各写一份 —— 单测钉死 round-trip 契约,改映射先改这里和测试。
export const ZONE_CZ = 23.5;

/** 世界坐标 → 图面像素 [px, py](w=画布边长) */
export function bMap(w, x, z) {
  const S = w / 100;
  return [w / 2 + x * S, w / 2 + (z - ZONE_CZ) * S];
}

/** 图面像素 → 世界坐标 [x, z](bMap 的严格逆) */
export function bUnmap(w, px, py) {
  const S = w / 100;
  return [(px - w / 2) / S, (py - w / 2) / S + ZONE_CZ];
}
