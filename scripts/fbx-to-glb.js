// 转换 FBX → GLB → 上传 Cloudflare R2
// 浏览器加载 FBX,GLTFExporter 导出,POST 回 Node 保存,Node 上传 R2
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ROOT = 'D:/b - 副本 (3) - 副本';
// ⚠️ 2026-08-31 安全修正:原先写死在此处的 R2 密钥曾随 PUBLIC 仓库泄露,已改为环境变量读取。
//    必须去 Cloudflare 后台吊销并轮换那对密钥——删文件无效,提交历史已被公开克隆。
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('缺少 R2 凭据:请先设置环境变量 R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY');
  process.exit(1);
}
const R2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
  forcePathStyle: true,
});
const MIME = { '.js':'text/javascript', '.html':'text/html', '.fbx':'application/octet-stream' };

// POST 接收 GLB
let receivedGLB = null;
let receivedLogs = [];
const server = http.createServer((req, res) => {
  console.log('[srv]', req.method, req.url);
  if (req.method === 'POST' && req.url === '/__glb') {
    const chunks=[];
    req.on('data', c=>chunks.push(c));
    req.on('end', ()=>{
      receivedGLB = Buffer.concat(chunks);
      receivedLogs = JSON.parse((req.headers['x-logs']||'[]').toString());
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p==='/') p='/convert.html';
  const fp = path.join(ROOT, p);
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/examples/jsm/loaders/FBXLoader.js":"/vendor/examples/jsm/loaders/FBXLoader.js","three/examples/jsm/libs/fflate.module.js":"/vendor/examples/jsm/libs/fflate.module.js","three/examples/jsm/curves/NURBSCurve.js":"/vendor/examples/jsm/curves/NURBSCurve.js","three/examples/jsm/curves/NURBSUtils.js":"/vendor/examples/jsm/curves/NURBSUtils.js","three/examples/jsm/utils/TextureUtils.js":"/vendor/examples/jsm/utils/TextureUtils.js","three/examples/jsm/exporters/GLTFExporter.js":"/vendor/examples/jsm/exporters/GLTFExporter.js"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const logs = [];
function loadFBX(url){return new Promise((res,rej)=>{new FBXLoader().load(url,r=>res(r),undefined,e=>rej(e));});}

// 修复贴图:用 CanvasTexture 强制生成有效图像数据(GLTFExporter 才能读)
async function fixTextures(obj){
  const textures=[];
  obj.traverse(o=>{ if(o.isMesh && o.material){ if(o.material.map) textures.push(o.material.map); if(o.material.emissiveMap) textures.push(o.material.emissiveMap); } });
  let ok=0;
  for(const t of textures){
    try{
      const img = t.image;
      if(!img) continue;
      // 确保图片加载完成
      if(!img.complete){ await new Promise(r=>{img.onload=r; img.onerror=r;}); }
      if(!img.width || !img.height){ console.log('跳过无效贴图'); continue; }
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const ct = new THREE.CanvasTexture(c);
      ct.flipY = t.flipY;
      // 替换材质上的贴图
      obj.traverse(o=>{ if(o.isMesh&&o.material){ const m=o.material; if(m.map===t)m.map=ct; if(m.emissiveMap===t)m.emissiveMap=ct; } });
      ok++;
    }catch(e){ console.log('贴图处理跳过:', e.message); }
  }
  return ok;
}

async function run(){
  try{
    console.log('开始');
    // 新人物:walk-relaxed-loop(带完整贴图,循环走路)
    const walk = await loadFBX('/public/models/avatar/walk2.fbx');
    console.log('walk2 done', walk.animations.length, walk.animations.map(a=>a.name+':'+a.duration.toFixed(1)).join('|'));
    const realAnims = [];
    // 取第一个有内容的动画,改名 walk(循环走路)
    const w = walk.animations.find(a=>a.duration>0.1);
    if(w){ w.name='walk'; realAnims.push(w); }
    console.log('real anims', realAnims.length, realAnims.map(a=>a.name+':'+a.duration.toFixed(1)).join('|'));
    walk.animations = realAnims;
    // 重要:保留贴图材质(不删 map),否则角色变灰色石像
    const texCount = await fixTextures(walk);
    console.log('带贴图材质数:', texCount);
    console.log('exporting...');
    const exporter = new GLTFExporter();
    const result = await new Promise((res,rej)=>exporter.parse(walk, res, rej, {binary:true, animations:walk.animations, trs:true}));
    console.log('exported', (result.byteLength/1024/1024).toFixed(1)+'MB');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/__glb');
    xhr.setRequestHeader('Content-Type','application/octet-stream');
    xhr.setRequestHeader('X-Logs', JSON.stringify(['exported '+(result.byteLength/1024/1024).toFixed(1)+'MB', 'anims:'+realAnims.length, 'tex:'+texCount]));
    xhr.onload = ()=>{ document.title='DONE'; };
    xhr.onerror = ()=>{ document.title='ERR'; };
    xhr.send(result);
    await new Promise(r=>{xhr.onload=r; xhr.onerror=r;});
  }catch(e){
    console.log('CAUGHT', e.message, e.stack);
    document.title='ERR';
  }
}
run();
</script></body></html>`;

async function main(){
  fs.writeFileSync(path.join(ROOT,'convert.html'), HTML);
  await new Promise(r=>server.listen(5191,r));
  const b = await chromium.launch({ channel:'msedge', headless:true });
  const p = await b.newPage();
  p.on('console', m=>console.log('[page]',m.text().substring(0,150)));
  await p.goto('http://127.0.0.1:5191/');
  for (let i=0;i<120;i++){
    const t = await p.title().catch(()=>'');
    if (t==='DONE'||t==='ERR') break;
    await p.waitForTimeout(2000);
    process.stdout.write('.');
  }
  console.log('');
  await b.close();
  // 收结果
  await new Promise(r=>setTimeout(r,2000));
  if (!receivedGLB || receivedGLB.length<1024) {
    console.log('未收到 GLB,日志:', receivedLogs);
    process.exit(1);
  }
  const localOut = path.join(ROOT,'public/models/avatar/avatar.glb');
  fs.writeFileSync(localOut, receivedGLB);
  console.log('GLB 已存:', localOut, (receivedGLB.length/1024/1024).toFixed(2)+'MB');
  receivedLogs.forEach(l=>console.log('[conv]', l));

  // 上传 R2
  const key = 'models/avatar/avatar.glb';
  process.stdout.write(`上传 ${key}...`);
  await R2.send(new PutObjectCommand({
    Bucket:'gallery-media', Key:key, Body:receivedGLB, ContentType:'model/gltf-binary',
  }));
  console.log(' OK');
  // 清理转换页
  try{fs.unlinkSync(path.join(ROOT,'convert.html'));}catch(e){}
  process.exit(0);
}
main().catch(e=>{console.error('FATAL',e);process.exit(2);});