// rooms-config.js — 万镜博物馆房间配置表
// 大堂 = hintze-hall 扫描(压缩 23.9MB);贵族房间 = 宅邸扫描系列(各 22~27MB)
// 坐标约定:每个世界占一个 (X,Z) 远区 + 独立地板高度 FLOOR,groundOverride 按当前世界接管
export const HALL = {
  id: 'hall',
  name: '万镜博物馆 · 中央大堂',
  url: '/models/hall/hall.glb',
  X: -140,
  Z: -190,
  SCALE: 1, // 2026-08-31 实测:源模型已是米制(130m 大楼),勿再缩放
  FLOOR: 0, // 大堂地面步行高度
  // 第一版可走区(相对大堂中心的半宽,进游戏实测后修正)
  WALK: { hx: 18, hz: 12 }, // 大堂约 130m 宽 × 40m 深,内圈保守可走区
  floor: true, // 2026-08-31:大堂外沙漠地形 Y=0~5 穿入室内,加 plane 盖住
  floorColor: 0xb8a07a, // 黄褐色石材地板,贴近大堂主色调
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
