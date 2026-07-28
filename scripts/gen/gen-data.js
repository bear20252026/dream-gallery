// gen-data.js — data.js 的 P/V 列表自动同步(保住 AI_DESC 位置配对)
// 规则:已存在的条目保持原顺序(配文不动);磁盘新增文件追加到尾部,配文补通用句;不存在的移除
// 用法: node gen-data.js   (npm run gen:data)
// 注意:只动 P/V/AI_DESC 三段,LINKS/VIDEO_WALL_SOURCES 等其余内容原样保留
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const IMG = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VID = ['.mp4', '.webm'];

async function main() {
  const { P, V, AI_DESC } = await import('./data.js');
  const photos = fs.readdirSync(path.join(ROOT, 'photos'))
    .filter(f => IMG.includes(path.extname(f).toLowerCase()) && !/^whiteboard-/i.test(f) && f !== 'thumbs')
    .map(f => 'photos/' + f);
  const videos = fs.readdirSync(path.join(ROOT, 'videos'))
    .filter(f => VID.includes(path.extname(f).toLowerCase()))
    .map(f => 'videos/' + f);

  // 旧 AI_DESC 按位置拆回:P 段 [0..P.length) + V 段 [P.length..)
  const descOfP = new Map(P.map((u, i) => [u, AI_DESC[i]]));
  const descOfV = new Map(V.map((u, j) => [u, AI_DESC[P.length + j]]));

  const newP = [...P.filter(u => photos.includes(u)), ...photos.filter(u => !P.includes(u))];
  const newV = [...V.filter(u => videos.includes(u)), ...videos.filter(u => !V.includes(u))];
  const newDesc = [
    ...newP.map(u => descOfP.get(u) || '新收录的照片。'),
    ...newV.map(u => descOfV.get(u) || '新收录的视频。'),
  ];

  let src = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  const fmt = arr => '[\n' + arr.map(u => `'${u}'`).join(',') + '\n]';
  src = src
    .replace(/export const P=\[[\s\S]*?\]/, 'export const P=' + fmt(newP))
    .replace(/export const V=\[[\s\S]*?\]/, 'export const V=' + fmt(newV))
    .replace(/export const AI_DESC=\[[\s\S]*?\]/, 'export const AI_DESC=[\n' + newDesc.map(d => JSON.stringify(d)).join(',\n') + '\n]');
  fs.writeFileSync(path.join(ROOT, 'data.js'), src);
  console.log(`[gen-data] P ${P.length}→${newP.length},V ${V.length}→${newV.length},AI_DESC ${newDesc.length} 条`);
}
main().catch(e => { console.error(e); process.exit(1); });
