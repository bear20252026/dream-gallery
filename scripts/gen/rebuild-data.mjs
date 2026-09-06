// rebuild-data.cjs — 重建 data.js:仅保留 5 张演示照片(2026-09-06 主人定,一次性脚本)
// 输入旧 data.js 结构,输出:P=5 演示图,V=[],VIDEO_WALL_SOURCES=[],AI_DESC 重排,
// LINKS 原样保留。下标配对规则:AI_DESC[i]=P[i] 配文;视频已清空故无视频段。
import { P, V, AI_DESC, LINKS, VIDEO_WALL_SOURCES } from '../../data.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const keep = ['photos/201.jpg', 'photos/202.jpg', 'photos/203.jpg', 'photos/204.jpg', 'photos/205.png'];
const demoCaps = keep.map((n) => {
  const i = P.indexOf(n);
  if (i < 0) throw new Error('演示照片不在 P 中: ' + n);
  return AI_DESC[i] || '新收录的照片。';
});

const out = `// 梦幻画廊数据配置：照片列表、展示视频、AI 文案、超链接
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
${demoCaps.map((c) => JSON.stringify(c)).join(',\n')}
];

// ===== 场景超链接配置（key 对应 mesh.userData 标记）=====
export const LINKS=${JSON.stringify(LINKS, null, 2)};

// ===== 视频墙专用视频(2026-09-06 已清空,非大屏视频全部退役)=====
export const VIDEO_WALL_SOURCES=[
];
`;

fs.writeFileSync(path.join(here, '..', '..', 'data.js'), out);
console.log('data.js rebuilt: P=5, V=0, AI_DESC=' + demoCaps.length);
console.log('captions:', JSON.stringify(demoCaps));
