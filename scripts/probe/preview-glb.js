// 预览 GLB:渲染动画多帧,检查模型/贴图/蒙皮是否正常
// 用法: node scripts/probe/preview-glb.js <glb路径> [帧数]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../..');
const GLB = path.resolve(process.argv[2] || '.docs-bak/catwalk-glb/catwalk-loop.blender.glb');
const FRAMES = parseInt(process.argv[3] || '4', 10);
const OUT_DIR = path.dirname(GLB);
const PORT = 5202;
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary' };

if (!fs.existsSync(GLB)) {
  console.error('GLB 不存在:', GLB);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let fp;
  if (p.startsWith('/vendor/')) fp = path.join(ROOT, p);
  else if (p === '/model.glb') fp = GLB;
  else fp = path.join(__dirname, p);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#20202a}</style>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/examples/jsm/loaders/GLTFLoader.js":"/vendor/examples/jsm/loaders/GLTFLoader.js"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const W=600,H=800;
const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(W,H); renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20202a);
scene.add(new THREE.HemisphereLight(0xffffff,0x555566,1.5));
const d1=new THREE.DirectionalLight(0xffffff,2.2); d1.position.set(2,5,4); scene.add(d1);
const d2=new THREE.DirectionalLight(0xffd9b0,0.9); d2.position.set(-3,2,-3); scene.add(d2);
const cam = new THREE.PerspectiveCamera(35, W/H, 0.01, 1000);

try {
  const gltf = await new Promise((res,rej)=> new GLTFLoader().load('/model.glb', res, undefined, rej));
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  console.log('原始 bbox:', box.min.toArray().map(n=>n.toFixed(2)).join(','), '→', box.max.toArray().map(n=>n.toFixed(2)).join(','), 'h=' + size.y.toFixed(2));
  const targetH = 1.7;
  const s = size.y > 0.001 ? targetH / size.y : 1;
  model.scale.setScalar(s);
  model.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(model);
  console.log('缩放后 bbox:', box2.min.toArray().map(n=>n.toFixed(2)).join(','), '→', box2.max.toArray().map(n=>n.toFixed(2)).join(','), 'h=' + ((box2.max.y-box2.min.y)).toFixed(2));
  model.position.y -= box2.min.y;
  model.position.x -= (box2.min.x+box2.max.x)/2;
  model.position.z -= (box2.min.z+box2.max.z)/2;
  model.updateMatrixWorld(true);
  model.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.frustumCulled=false; } });
  scene.add(model);

  let maps=0, noMap=0;
  model.traverse(o=>{ if(o.isMesh){ const ms=Array.isArray(o.material)?o.material:[o.material]; ms.forEach(m=>{ if(m.map) maps++; else noMap++; }); } });

  const clip = gltf.animations.find(a=>a.duration>0.1) || gltf.animations[0];
  window.__info = {
    anims: gltf.animations.length,
    clipName: clip ? clip.name : null,
    duration: clip ? +clip.duration.toFixed(3) : 0,
    tracks: clip ? clip.tracks.length : 0,
    maps, noMap,
    rawBox: [box.min.y.toFixed(2), box.max.y.toFixed(2), size.y.toFixed(2)],
    scaledBox: [box2.min.y.toFixed(2), box2.max.y.toFixed(2), (box2.max.y-box2.min.y).toFixed(2)],
  };
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  // 等贴图解码
  await new Promise(r=>setTimeout(r, 3000));

  cam.position.set(2.5, 1.0, 4.0);
  cam.lookAt(0, 0.9, 0);
  cam.fov = 45;
  const times = [];
  for (let i=0;i<${FRAMES};i++) times.push((clip.duration * i) / ${FRAMES});
  window.__shots = [];
  let t=0;
  for (const tt of times) {
    mixer.update(tt - t); t = tt;
    renderer.render(scene, cam);
    window.__shots.push(renderer.domElement.toDataURL('image/png'));
  }
} catch(e) {
  window.__err = String(e && e.message || e);
}
document.title = 'READY';
</script></body></html>`;

(async () => {
  const htmlPath = path.join(__dirname, 'preview-glb.html');
  fs.writeFileSync(htmlPath, HTML);
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await b.newPage();
  const cLogs = [];
  page.on('console', (m) => cLogs.push(`[${m.type()}] ${m.text().slice(0, 180)}`));
  await page.goto(`http://127.0.0.1:${PORT}/preview-glb.html`, { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    ready = await page.evaluate(() => document.title === 'READY');
    if (ready) break;
  }
  const info = ready ? await page.evaluate(() => window.__info) : null;
  const err = ready ? await page.evaluate(() => window.__err) : null;
  const shots = ready ? await page.evaluate(() => window.__shots || []) : [];
  await b.close(); server.close();
  fs.unlinkSync(htmlPath);

  if (err) console.log('错误:', err);
  console.log('模型:', JSON.stringify(info));
  const base = path.basename(GLB, '.glb');
  shots.forEach((d, i) => {
    const f = path.join(OUT_DIR, `${base}-f${i + 1}.png`);
    fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64'));
    console.log('帧', i + 1, '→', f);
  });
  console.log('\n控制台(前 6):');
  cLogs.slice(0, 6).forEach((l) => console.log('  ' + l));
})();