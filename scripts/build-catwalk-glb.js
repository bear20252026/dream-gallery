// catwalk FBX → GLB 正式构建脚本
// FBX 内嵌贴图(ActorCore 导出),但 FBXLoader 走外部路径取不到 → 需先手工提取再回贴
// 步骤: 1) 扫描提取内嵌 PNG 并按 RelativeFilename 命名  2) 浏览器内加载 FBX + 回贴贴图
//       3) 渲染动画多帧验证  4) GLTFExporter 导出 GLB
// 用法: node scripts/build-catwalk-glb.js [loop|start|end]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const SRC_DIR = 'C:/Users/17296/Desktop/新建文件夹';
const TEX_DIR = path.join(ROOT, '.docs-bak/catwalk-textures');
const OUT_DIR = path.join(ROOT, '.docs-bak/catwalk-glb');

const FBX_NAME = process.argv[2] === 'start' ? 'catwalk-start-378915'
  : process.argv[2] === 'end' ? 'catwalk-end-378898'
  : 'catwalk-loop-378982';

const PORT = 5200;
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.fbx': 'application/octet-stream', '.png': 'image/png', '.webp': 'image/webp' };

// ============ 步骤1: 提取内嵌贴图 ============
function extractTextures() {
  fs.mkdirSync(TEX_DIR, { recursive: true });
  const fbxPath = path.join(SRC_DIR, FBX_NAME + '.fbx');
  const buf = fs.readFileSync(fbxPath);

  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const pngs = [];
  let i = 0;
  while ((i = buf.indexOf(PNG_SIG, i)) !== -1) {
    const e = buf.indexOf(PNG_END, i);
    if (e === -1) { i += 8; continue; }
    pngs.push({ offset: i, end: e + 8, w: buf.readUInt32BE(i + 16), h: buf.readUInt32BE(i + 20) });
    i = e + 8;
  }

  // 材质名 → 贴图槽(FBX 材质名即贴图名前缀)
  const MATS = ['M_actor_jsspsi_body_01', 'M_actor_jsspsi_cloth_02', 'M_actor_jsspsi_cloth_03',
                'M_actor_jsspsi_face_01', 'M_actor_jsspsi_hair_01', 'M_actor_jsspsi_iris_01'];
  const SLOTS = ['Diffuse', 'Opacity'];

  const map = []; // { texName, file, w, h }
  for (const mat of MATS) {
    for (const slot of SLOTS) {
      const texName = `${mat}_${slot}`;
      const pos = buf.indexOf(texName);
      if (pos === -1) continue;
      // 取该名字之后最近的 PNG
      let best = null;
      for (const pg of pngs) {
        const d = pg.offset - pos;
        if (d > 0 && d < 400000 && (!best || d < best.d)) best = { pg, d };
      }
      if (!best) continue;
      const data = buf.slice(best.pg.offset, best.pg.end);
      const file = `${texName}.png`;
      fs.writeFileSync(path.join(TEX_DIR, file), data);
      map.push({ texName, file, w: best.pg.w, h: best.pg.h, bytes: data.length });
    }
  }
  console.log(`[1/4] 提取贴图 ${map.length} 张 (共 ${(map.reduce((s, m) => s + m.bytes, 0) / 1024 / 1024).toFixed(2)}MB)`);
  map.forEach((m) => console.log(`      ${m.texName} ${m.w}x${m.h} ${(m.bytes / 1024).toFixed(0)}KB`));

  // 压缩:>1024 的降到 1024,PNG 全部转 WebP(保留 RGBA 以支持 Opacity)
  // 直接嵌入脚本(避免每次写临时 .py 文件)
  const py = `
import sys, os
from PIL import Image
d = sys.argv[1]
for fn in sorted(os.listdir(d)):
    if not fn.lower().endswith('.png'): continue
    p = os.path.join(d, fn)
    im = Image.open(p)
    if max(im.size) > 1024:
        r = 1024 / max(im.size)
        im = im.resize((int(im.size[0]*r), int(im.size[1]*r)), Image.LANCZOS)
    if im.mode not in ('RGBA', 'RGB'): im = im.convert('RGBA')
    out = os.path.splitext(p)[0] + '.webp'
    im.save(out, 'WEBP', quality=88, method=6)
    os.remove(p)
    print('  %s -> %s %dKB' % (fn, os.path.basename(out), os.path.getsize(out)//1024))
`;
  try {
    require('child_process').execFileSync('python', ['-c', py, TEX_DIR], { stdio: 'inherit' });
  } catch (e) {
    console.log('      (贴图压缩跳过: ' + String(e && e.message).slice(0, 80) + ')');
  }
  // 压缩后重新统计(file 名可能已变 .webp)
  for (const m of map) {
    const webp = path.join(TEX_DIR, m.file.replace(/\.png$/, '.webp'));
    const png = path.join(TEX_DIR, m.file);
    if (fs.existsSync(webp)) {
      m.file = m.file.replace(/\.png$/, '.webp');
      m.bytes = fs.statSync(webp).size;
    } else if (fs.existsSync(png)) {
      m.bytes = fs.statSync(png).size;
    }
  }
  console.log(`      压缩后 ${(map.reduce((s, m) => s + m.bytes, 0) / 1024 / 1024).toFixed(2)}MB`);
  return map;
}

// ============ 步骤2-4: 浏览器内回贴 + 渲染 + 导出 ============
function makeServer() {
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let fp;
    if (p.startsWith('/vendor/')) fp = path.join(ROOT, p);
    else if (p.startsWith('/fbx/')) fp = path.join(SRC_DIR, p.slice(5));
    else if (p.startsWith('/tex/')) fp = path.join(TEX_DIR, p.slice(5));
    else fp = path.join(__dirname, p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

function makeHTML(texMap) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#20202a}</style>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/examples/jsm/loaders/FBXLoader.js":"/vendor/examples/jsm/loaders/FBXLoader.js","three/examples/jsm/libs/fflate.module.js":"/vendor/examples/jsm/libs/fflate.module.js","three/examples/jsm/curves/NURBSCurve.js":"/vendor/examples/jsm/curves/NURBSCurve.js","three/examples/jsm/curves/NURBSUtils.js":"/vendor/examples/jsm/curves/NURBSUtils.js","three/examples/jsm/utils/TextureUtils.js":"/vendor/examples/jsm/utils/TextureUtils.js","three/examples/jsm/exporters/GLTFExporter.js":"/vendor/examples/jsm/exporters/GLTFExporter.js","three/examples/jsm/loaders/GLTFLoader.js":"/vendor/examples/jsm/loaders/GLTFLoader.js"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const TEX_MAP = ${JSON.stringify(texMap)};
const out = { ready:false, error:null, log:[], shots:[], info:{} };
const log = out.log;

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

function loadTex(url){ return new Promise((res,rej)=> new THREE.TextureLoader().load(url, res, undefined, rej)); }

try {
  const fbx = await new Promise((res,rej)=> new FBXLoader().load('/fbx/${FBX_NAME}.fbx', res, undefined, rej));
  log.push('FBX 已加载');

  // ---- 回贴:material.name 是贴图名前缀 ----
  const texLoader = new THREE.TextureLoader();
  let applied = 0;
  const seen = new Set();
  fbx.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      const base = m.name || '';
      if (!base) continue;
      for (const t of TEX_MAP) {
        // t.texName 形如 M_actor_jsspsi_body_01_Diffuse
        if (!t.texName.startsWith(base + '_')) continue;
        const slot = t.texName.slice(base.length + 1); // Diffuse / Opacity
        const tex = texLoader.load('/tex/' + t.file);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        if (slot === 'Diffuse') m.map = tex;
        else if (slot === 'Opacity') { m.alphaMap = tex; m.transparent = true; }
        applied++;
      }
    }
  });
  log.push('贴图回贴 ' + applied + ' 张');
  out.info.applied = applied;

  // ---- 导出 GLB(需等贴图解码完成) ----
  await new Promise(r => setTimeout(r, 3000));
  // 剔除 morphTarget 轨道:FBX 动画带 morphTargetInfluences,但网格无 morphAttributes,
  // 直接导出会报 "Morph target name not found" 而中断
  const cleanAnims = (fbx.animations || []).map((clip) => {
    const tracks = clip.tracks.filter((t) => !/\.morphTargetInfluences/.test(t.name));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
  log.push('动画轨道 ' + (fbx.animations[0] ? fbx.animations[0].tracks.length : 0) + ' → ' + (cleanAnims[0] ? cleanAnims[0].tracks.length : 0));
  const exporter = new GLTFExporter();
  const glb = await new Promise((res, rej) => exporter.parse(fbx, res, rej, { binary: true, animations: cleanAnims, trs: true }));
  log.push('GLB ' + (glb.byteLength/1024/1024).toFixed(2) + 'MB');
  window.__glb = new Uint8Array(glb);

  // ---- 渲染动画多帧验证 ----
  const model = fbx;
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  log.push('bboxH=' + size.y.toFixed(2));
  model.scale.setScalar(1.7 / size.y);
  model.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
  model.position.x -= (box2.min.x+box2.max.x)/2;
  model.position.z -= (box2.min.z+box2.max.z)/2;
  model.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.frustumCulled=false; } });
  scene.add(model);

  const clip = fbx.animations[0];
  log.push('clip=' + clip.name + ' dur=' + clip.duration.toFixed(2));
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();

  cam.position.set(1.0, 1.0, 3.2);
  cam.lookAt(0, 0.85, 0);

  let t = 0;
  for (const tt of [0, 0.33, 0.65, 0.98]) {
    mixer.update(tt - t); t = tt;
    renderer.render(scene, cam);
    out.shots.push(renderer.domElement.toDataURL('image/png'));
  }
  out.info.duration = +clip.duration.toFixed(2);
} catch(e) {
  out.error = String(e && e.stack || e).slice(0, 600);
}
out.ready = true;
window.__out = out;
document.title = 'READY';
</script></body></html>`;
}

(async () => {
  const texMap = extractTextures();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(__dirname, 'catwalk-build.html');
  fs.writeFileSync(htmlPath, makeHTML(texMap));

  const server = makeServer();
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await b.newPage();
  const cLogs = [];
  page.on('console', (m) => cLogs.push(`[${m.type()}] ${m.text().slice(0, 180)}`));
  await page.goto(`http://127.0.0.1:${PORT}/catwalk-build.html`, { waitUntil: 'domcontentloaded' });

  let ready = false;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000);
    ready = await page.evaluate(() => document.title === 'READY');
    if (ready) break;
  }
  const out = ready ? await page.evaluate(() => ({ ...window.__out, glbLen: window.__glb ? window.__glb.length : 0 })) : null;
  const shots = ready ? await page.evaluate(() => window.__out.shots || []) : [];
  let glbBuf = null;
  if (out && out.glbLen > 0) {
    const arr = await page.evaluate(() => Array.from(window.__glb));
    glbBuf = Buffer.from(arr);
  }
  await b.close(); server.close();
  fs.unlinkSync(htmlPath);

  console.log('\n[2/4] 回贴 + [3/4] 渲染');
  if (!out) { console.log('超时'); cLogs.slice(0, 10).forEach((l) => console.log('  ' + l)); process.exit(1); }
  out.log.forEach((l) => console.log('      ' + l));
  if (out.error) console.log('      错误: ' + out.error);

  if (glbBuf) {
    const f = path.join(OUT_DIR, FBX_NAME + '.glb');
    fs.writeFileSync(f, glbBuf);
    console.log(`\n[4/4] GLB 写入 ${f} (${(glbBuf.length / 1024 / 1024).toFixed(2)}MB)`);
  } else {
    console.log('\n[4/4] 未生成 GLB');
  }
  shots.forEach((d, i) => {
    fs.writeFileSync(path.join(OUT_DIR, `${FBX_NAME}-f${i + 1}.png`), Buffer.from(d.split(',')[1], 'base64'));
    console.log('      帧 ' + (i + 1) + ' 已保存');
  });
  console.log('\n控制台(前 8):');
  cLogs.slice(0, 8).forEach((l) => console.log('  ' + l));
})();
