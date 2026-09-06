// layout.mjs — 画廊建筑布局常量表(2026-09-07 P4「布局数据化」第一步)
// 目标:建造几何(scene.js)、碰撞边界、特效系统(main.js 组合根)、探针坐标断言
// 共用同一份尺寸源;改布局尺寸只改这里的数字,不再到千行建造代码里找字面量。
// 坐标系:x 向东,z 向北为负;展厅区在北(z=-12~6),回字形大厅在南(z=6~28)。

export const LAYOUT = {
  // 展厅区外边界(北段,保留原 A-G 展厅)
  outerWest: -18, // 西墙
  outerEast: 18, // 东墙
  outerNorth: -12, // 北墙
  outerSouthEx: 6, // 展厅区/大厅分界(E=exhibition)
  // 整体最南端(回字形大厅南墙)
  outerSouth: 28,
  // 天花板高度(m)
  ceilingHeight: 5,
  // 回字内墙禁区(大厅中空四面墙)
  innerWest: -7,
  innerEast: 7,
  innerNorth: 11,
  innerSouth: 23,
};
