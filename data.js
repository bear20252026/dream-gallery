// 梦幻画廊数据配置：照片列表、展示视频、AI 文案、超链接
// 修改内容只需改这里，无需触碰 index.html 的逻辑代码
//
// 【新增内容规则】AI_DESC 与 P+V 按下标一一对应：照片 P[i] 的配文是 AI_DESC[i]，
// 视频 V[j] 的配文是 AI_DESC[P.length+j]。新增照片或视频时，必须在 AI_DESC
// 相同下标位置同步添加配文，否则会错位。新内容追加在数组末尾并保持分组注释。
// 2026-09-06 主人定:全库照片退役,仅保留 5 张演示照片;非大屏视频(挂画视频/视频墙)全部删除。
// 户外大屏轮播视频不走本文件(/api/bigscreen + R2 CDN),不受影响。

// === 演示照片(5 张) ===
export const P=[
'photos/201.jpg','photos/202.jpg','photos/203.jpg','photos/204.jpg','photos/205.png'
];
export const V=[
];

// ===== AI描述库（5 段，与 P 按下标一一对应）=====
export const AI_DESC=[
"新收录的照片。",
"新收录的照片。",
"新收录的照片。",
"新收录的照片。",
"新收录的照片。"
];

// ===== 场景超链接配置（key 对应 mesh.userData 标记）=====
export const LINKS={
  "isLink": "https://agent.qianwen.com/mos/af73082ff2274affbf02cd3a9842302b/5857e72df6641f21c02b92fbb405d8c2",
  "isLink2": "https://www.kdocs.cn/l/cgUq9GqSHf26",
  "isLink3": "https://www.kdocs.cn/l/cuqOBCE1qcjG",
  "isLink4": "https://www.kdocs.cn/l/cjCbqfKz7e15",
  "isLink5": "https://www.kdocs.cn/l/cuTvyP1ngeEl",
  "isLink6": "https://www.kdocs.cn/l/clLHq4jjV1co",
  "isLink7": "https://www.kdocs.cn/l/cauKjiGksapw",
  "isLink8": "https://www.kdocs.cn/l/ckcmhfQKTmEF",
  "isLink9": "https://www.kdocs.cn/l/ca0bDNdsKNW5",
  "isLink10": "https://www.kdocs.cn/l/ctGFg2fB0Yo1",
  "isLink11": "https://www.kdocs.cn/l/cuUzaB1EQOUx",
  "isLink12": "https://www.kdocs.cn/l/ctt5wXxgxRVK",
  "isLink13": "https://www.kdocs.cn/l/cin61CQoELxN",
  "isGarden": "https://agent.my.cn/mos/af0ef37e44084e71af7876886e07ae40/a5498f1a9679a8f4cf8c7e7f26ba3ee9"
};

// ===== 视频墙专用视频(2026-09-06 已清空,非大屏视频全部退役)=====
export const VIDEO_WALL_SOURCES=[
];
