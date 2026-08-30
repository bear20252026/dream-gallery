// 对比验证:Si(GLB) 骨架 vs catwalk(FBX) 骨架的完整度
// catwalk 需浏览器解析 FBX;Si 直接读 GLB
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../..');
const DESKTOP = 'C:/Users/17296/Desktop';
const PORT = 5197;
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.fbx': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let fp;
  if (p.startsWith('/vendor/')) fp = path.join(ROOT, p);
  else if (p.startsWith('/desktop/')) fp = path.join(DESKTOP, p.slice(9));
  else if (p.startsWith('/textures/')) fp = path.join(DESKTOP, p.slice(1));
  else fp = path.join(__dirname, p);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/examples/jsm/loaders/FBXLoader.js":"/vendor/examples/jsm/loaders/FBXLoader.js","three/examples/jsm/libs/fflate.module.js":"/vendor/examples/jsm/libs/fflate.module.js","three/examples/jsm/curves/NURBSCurve.js":"/vendor/examples/jsm/curves/NURBSCurve.js","three/examples/jsm/curves/NURBSUtils.js":"/vendor/examples/jsm/curves/NURBSUtils.js"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const out = { error:null, bones:[], animTracks:0, duration:0 };
try {
  const fbx = await new Promise((res,rej)=> new FBXLoader().load('/desktop/catwalk-loop-378982.fbx', res, undefined, rej));
  out.duration = fbx.animations[0] ? +fbx.animations[0].duration.toFixed(3) : 0;
  out.animTracks = fbx.animations[0] ? fbx.animations[0].tracks.length : 0;

  // 找 skeleton
  let skel = null;
  fbx.traverse(o => { if (o.isSkinnedMesh && o.skeleton) skel = o.skeleton; });
  if (!skel) { out.error = 'no skeleton'; throw new Error('no skeleton'); }

  fbx.updateMatrixWorld(true);
  // 各骨骼世界坐标
  const list = skel.bones.map(b => {
    const v = new THREE.Vector3();
    b.getWorldPosition(v);
    return { name: b.name, x:+v.x.toFixed(3), y:+v.y.toFixed(3), z:+v.z.toFixed(3) };
  });
  // 归一化到身高比例
  const ys = list.map(b=>b.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const h = maxY - minY;
  list.forEach(b => { b.pct = +(((b.y-minY)/h)*100).toFixed(1); b.atOrigin = Math.abs(b.x)<1e-4 && Math.abs(b.y-minY)<1e-4 && Math.abs(b.z)<1e-4; });
  out.bones = list;
  out.height = +h.toFixed(3);
  // 关键解剖骨是否齐全
  const want = ['Hip','Pelvis','Spine','Neck','Head','Thigh','Calf','Foot','Toe','Upperarm','Forearm','Hand','Clavicle'];
  out.coverage = {};
  want.forEach(w => {
    const hit = list.filter(b => b.name.toLowerCase().includes(w.toLowerCase()));
    out.coverage[w] = { count: hit.length, atOrigin: hit.filter(b=>b.atOrigin).length };
  });
} catch(e) { out.error = String(e && e.message || e); }
window.__out = out;
document.title = 'READY';
</script></body></html>`;

(async () => {
  fs.writeFileSync(path.join(__dirname, 'compare-skeletons.html'), HTML);
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--no-sandbox'],
  });
  const page = await b.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/compare-skeletons.html`, { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    ready = await page.evaluate(() => document.title === 'READY');
    if (ready) break;
  }
  let out = null;
  if (ready) out = await page.evaluate(() => window.__out);
  await b.close(); server.close();
  fs.unlinkSync(path.join(__dirname, 'compare-skeletons.html'));

  if (!ready) { console.log('超时'); process.exit(1); }
  if (out.error) { console.log('错误:', out.error); process.exit(1); }

  console.log('=== catwalk 骨架 ===');
  console.log('骨骼数:', out.bones.length, '| 身高:', out.height, '| 动画时长:', out.duration, 's | tracks:', out.animTracks);
  console.log('\n关键解剖骨覆盖度:');
  for (const [k, v] of Object.entries(out.coverage)) {
    const ok = v.count > 0 && v.atOrigin === 0;
    console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(10)} 数量=${String(v.count).padStart(2)}  位于原点=${v.atOrigin}`);
  }
  console.log('\n骨骼位置(按高度降序, 前 40):');
  const sorted = [...out.bones].sort((a,b)=>b.pct-a.pct);
  sorted.slice(0, 40).forEach(bb => {
    console.log(`  ${String(bb.pct).padStart(5)}%  x=${String(bb.x).padStart(7)} y=${String(bb.y).padStart(7)}  ${bb.name}${bb.atOrigin?'  ← 原点(无效)':''}`);
  });
})();