// list-deleted-photos.cjs — 从 git HEAD 的旧 data.js 提取待删除照片清单(2026-09-06 一次性)
// 输出:除 5 张演示照片外的全部 P 条目(每行一个),供本地与服务器同步删除
const { execSync } = require('child_process');
const old = execSync('git show HEAD:data.js', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const m = old.match(/export const P=\[([\s\S]*?)\];/);
if (!m) { console.error('P not found'); process.exit(1); }
const P = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
const keep = /^photos\/20[1-5]\./;
const del = P.filter((n) => !keep.test(n));
console.log(del.join('\n'));
console.error('total delete: ' + del.length + ' (P total ' + P.length + ')');
