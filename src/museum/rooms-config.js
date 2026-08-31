// rooms-config.js — 万镜博物馆房间配置表
// 大堂 = hintze-hall 扫描(压缩 23.9MB);贵族房间 = 宅邸扫描系列(各 22~27MB)
// 坐标约定:每个世界占一个 (X,Z) 远区 + 独立地板高度 FLOOR,groundOverride 按当前世界接管
export const HALL = {
  id: 'hall',
  name: '万镜博物馆 · 中央大堂',
  url: '/models/hall/hall.glb',
  X: -140,
  Z: -190,
  SCALE: 1, // 源模型已是米制
  // 2026-08-31 用户要求:建筑距离地面的高度再上调(沙漠地形峰顶 Y≈10)。
  // 立起后大堂 worldBox Y 从 0 起算(地板 sol Z=-0.09 → 对齐 Y=0),FLOOR=20 即大堂底面抬高到 20m。
  FLOOR: 20, // 大堂地板步行高度(再上调:12 → 20)
  WALK: { hx: 45, hz: 18 },
  floor: true, // 大堂外圈加黄褐色石材 plane 盖住穿入
  floorColor: 0xb8a07a,
};

export const ROOMS = [
  {
    id: 'picture_gallery',
    name: '图片陈列馆',
    url: '/models/rooms/picture_gallery.glb',
    X: -95,
    Z: -300, // 房间在大堂旁(北侧)
    FLOOR: 0,
    WALK: { hx: 5.5, hz: 11 }, // 12.2×26.2 长廊,取内圈
  },
  {
    id: 'upper_vestibule',
    name: '晨光门厅',
    url: '/models/rooms/upper_vestibule.glb',
    X: -230,
    Z: -300,
    FLOOR: 0,
    WALK: { hx: 8, hz: 6 },
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
