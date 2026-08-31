// rooms-config.js — 万镜博物馆房间配置表
// 大堂 = hintze-hall 扫描(压缩 23.9MB);贵族房间 = 宅邸扫描系列(各 22~27MB)
// 坐标约定:每个世界占一个 (X,Z) 远区 + 独立地板高度 FLOOR,groundOverride 按当前世界接管
export const HALL = {
  id: 'hall',
  name: '万镜博物馆 · 中央大堂',
  url: '/models/hall/hall.glb',
  X: -1200,
  Z: -900,
  SCALE: 0.01, // 源模型厘米单位 → 米
  FLOOR: 0, // 大堂地面步行高度
  // 第一版可走区(相对大堂中心的半宽,进游戏实测后修正)
  WALK: { hx: 14, hz: 9 },
};

export const ROOMS = [
  {
    id: 'picture_gallery',
    name: '图片陈列馆',
    url: '/models/rooms/picture_gallery.glb',
    X: -1200,
    Z: -300, // 房间与大堂不同远区,groundOverride 按世界隔离
    FLOOR: 0,
    WALK: { hx: 5.5, hz: 11 }, // 12.2×26.2 长廊,取内圈
  },
  {
    id: 'upper_vestibule',
    name: '晨光门厅',
    url: '/models/rooms/upper_vestibule.glb',
    X: -600,
    Z: -300,
    FLOOR: 0,
    WALK: { hx: 8, hz: 6 },
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
