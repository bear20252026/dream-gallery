// 一次性体检:扫 models/ 找出「仍是 PNG 纹理、没真压上」的 GLB(2026-09-28)
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..', '..', 'models');
function walk(d, o = []) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, o);
    else if (/\.(glb|gltf)$/i.test(p)) o.push(p);
  }
  return o;
}
const files = walk(ROOT);
let bad = [],
  tot = 0,
  badTot = 0;
for (const f of files) {
  const b = fs.readFileSync(f);
  tot += b.length;
  const webp = b.includes(Buffer.from('WEBP'));
  const png = b.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const mo = b.includes(Buffer.from('EXT_meshopt_compression'));
  if (png && !webp) {
    bad.push([f, b.length, mo]);
    badTot += b.length;
  }
}
console.log('模型 ' + files.length + ' 个 / ' + (tot / 1048576).toFixed(1) + 'MB');
console.log('--- 疑似未真压缩(仍是 PNG 纹理)---');
for (const it of bad.sort((a, b) => b[1] - a[1]))
  console.log('  ' + (it[1] / 1048576).toFixed(2) + 'MB  meshopt=' + it[2] + '  ' + it[0]);
console.log('共 ' + bad.length + ' 个 / ' + (badTot / 1048576).toFixed(1) + 'MB');
