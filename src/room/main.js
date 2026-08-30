// src/room/main.js — 小房间客户端:three 场景 + 多人同步 + 聊天 + 表情
//
// 角色来源声明(开源署名,CC-BY-4.0 要求必须署名):
//   房间角色使用 Sketchfab 开源模型「Wise ZZZ」by ansaldotoys2
//   许可证:CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
//   来源:https://sketchfab.com/3d-models/wise-zzz-2fd21fd823904f80ad39ce0ca1b87608
//   商用允许,但使用处须注明作者。本游戏仅作学习用途复用该美术资产。
//   资产为 glTF(/assets/wise_zzz.glb),由 GLTFLoader 加载;缺失时回退到程序化轮滑小人。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import './room.css';

// 角色 glTF 资源路径(Wise ZZZ, CC-BY-4.0);缺失时 makeAvatar 回退到程序化轮滑小人。
const WISE_ZZZ_GLB = '/assets/wise_zzz/scene.gltf';

// ---------- DOM ----------
const container = document.getElementById('room-c');
const hudCode = document.getElementById('hudCode');
const hudCount = document.getElementById('hudCount');
const banner = document.getElementById('banner');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const leaveBtn = document.getElementById('leaveBtn');
const roomHint = document.getElementById('roomHint');
const inviteBtn = document.getElementById('inviteBtn');
const minimap = document.getElementById('minimap');

const params = new URLSearchParams(location.search);
const ROOM = (params.get('code') || '').toUpperCase();
const NAME = (params.get('name') || '访客').slice(0, 16);
if (!ROOM) location.href = '/lobby.html';

function showBanner(text, show) {
  banner.textContent = text;
  banner.style.display = show ? 'block' : 'none';
}

// ---------- three 基础 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#241029');
scene.fog = new THREE.Fog('#241029', 24, 60);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 7, 12);
camera.lookAt(0, 1, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight('#ffe9d6', '#3a2a4a', 0.9));
const dir = new THREE.DirectionalLight('#fff3e0', 0.8);
dir.position.set(6, 12, 4);
scene.add(dir);

// 地面
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 48),
  new THREE.MeshStandardMaterial({ color: '#3a2a44', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(60, 60, 0x6b4a6b, 0x4a3350);
grid.material.opacity = 0.35;
grid.material.transparent = true;
scene.add(grid);
// 中央光环,作为聚会焦点
const ring = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.0, 48),
  new THREE.MeshBasicMaterial({ color: '#ff9a9e', transparent: true, opacity: 0.5, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

// 氛围装饰:环形灯柱 + 中央光柱。即使房间里只有一个人,也明显是个 3D 空间,不会"一片空白"
function addAmbiance() {
  const posts = 6;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const r = 8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: '#2a1c34', roughness: 0.8 })
    );
    post.position.set(x, 1.1, z);
    scene.add(post);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb347', emissiveIntensity: 1.5 })
    );
    orb.position.set(x, 2.6, z);
    scene.add(orb);
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.95, 6, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ff9a9e', transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  beam.position.y = 3;
  scene.add(beam);
  // 几块漂浮水晶,增加空间纵深感
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const r = 5 + (i % 2);
    const cry = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: '#bff', emissive: '#88c', emissiveIntensity: 0.5, roughness: 0.3 })
    );
    cry.position.set(Math.cos(a) * r, 1.4 + (i % 3) * 0.5, Math.sin(a) * r);
    scene.add(cry);
  }
}
addAmbiance();

// ---------- 头像 ----------
function makeTag(text, bg) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    roundRect(g, 4, 4, 248, 56, 14); g.fill();
  }
  g.fillStyle = '#fff';
  g.font = '600 30px "PingFang SC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(bg ? 2.2 : 1.4, bg ? 0.55 : 0.35, 1);
  sp.renderOrder = 999;
  return sp;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 头像:先放程序化"轮滑小人"占位,再异步加载轮滑角色 glTF;成功则替换,失败保持小人。
// 占位小人的身体挂在 rollPivot 下保持直立;轮子单独放在 wheels 组里,移动时自转模拟滑行。
function makeAvatar(color, name) {
  const group = new THREE.Group();
  const rollPivot = new THREE.Group();
  group.add(rollPivot);

  const skater = new THREE.Group();
  rollPivot.add(skater);
  const wheels = new THREE.Group(); // 仅轮子进这个组,滚动时自转
  rollPivot.add(wheels);
  buildSkater(skater, wheels, color);

  // 昵称牌(始终存在,浮在头顶,不参与滚动)
  const tag = makeTag(name, 'rgba(20,12,28,0.78)');
  tag.position.y = 2.15;
  group.add(tag);
  // 表情牌(默认隐藏)
  const emote = makeTag('', null);
  emote.position.y = 2.6;
  emote.visible = false;
  group.add(emote);

  const avatar = { group, rollPivot, skater, wheels, tag, emote, emoteTimer: 0, color, model: null, mixer: null, action: null, isModel: false, rollAngle: 0 };
  loadRollerblade(avatar);
  return avatar;
}

// 程序化生成一个站在轮滑鞋上的小人(占位用,真实角色 glb 加载后整体替换)。
function buildSkater(parent, wheels, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: '#fff3ea', roughness: 0.5 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#ff5a7a', roughness: 0.5 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.4 });
  // 躯干
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 12), mat);
  torso.position.y = 1.0;
  parent.add(torso);
  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), skin);
  head.position.y = 1.55;
  parent.add(head);
  // 手臂
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), mat);
    arm.position.set(sx * 0.34, 1.05, 0);
    arm.rotation.z = sx * 0.35;
    parent.add(arm);
  }
  // 双腿 + 轮滑鞋 + 轮子
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 4, 8), mat);
    leg.position.set(sx * 0.16, 0.55, 0);
    parent.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.5), shoeMat);
    shoe.position.set(sx * 0.16, 0.28, 0.06);
    parent.add(shoe);
    for (const wz of [-0.15, 0.15]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14), wheelMat);
      w.rotation.z = Math.PI / 2; // 轮轴朝 X,绕 X 自转即滚动
      w.position.set(sx * 0.16, 0.12, 0.06 + wz);
      wheels.add(w);
    }
  }
}

// 单例 loader,复用以走浏览器缓存
const _gltfLoader = new GLTFLoader();
function loadRollerblade(avatar) {
  _gltfLoader.load(
    WISE_ZZZ_GLB,
    (gltf) => {
      // 用 SkeletonUtils.clone 克隆,保证每个玩家(含远端)有独立骨架/动画
      const model = SkeletonUtils.clone(gltf.scene);
      // 归一化:脚踩地面(y=0)、身高约 1.8
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const h = size.y || 1;
      const scale = 1.8 / h;
      model.scale.setScalar(scale);
      model.position.y -= box.min.y * scale; // 用包围盒底部对齐,保证脚踩在地面
      avatar.rollPivot.add(model);
      avatar.model = model;
      avatar.isModel = true;
      // 动画:优先播放 roll/skate/glide,否则取第一个 clip
      if (gltf.animations && gltf.animations.length) {
        avatar.mixer = new THREE.AnimationMixer(model);
        avatar.action = avatar.mixer.clipAction(pickClip(gltf.animations));
        avatar.action.play();
      }
      // 移除程序化占位小人,交给真正的角色
      avatar.rollPivot.remove(avatar.skater);
    },
    undefined,
    (err) => {
      // 资源缺失/加载失败:保留胶囊占位,不影响房间可用性
      console.warn('[room] wise_zzz 角色加载失败,使用占位胶囊:', err && (err.message || err));
    }
  );
}
function pickClip(clips) {
  const want = ['roll', 'skate', 'glide', 'move', 'run', 'walk', 'idle'];
  for (const w of want) {
    const c = clips.find((c) => c.name.toLowerCase().includes(w));
    if (c) return c;
  }
  return clips[0];
}

// ---------- 状态 ----------
const remotes = new Map(); // id -> { avatar, tx,ty,tz,try, emote }
let me = null; // { id, color, name, x,y,z,ry, avatar }
const cam = { yaw: 0, pitch: 0.35 };
const keys = {};
const padDir = { f: false, b: false, l: false, r: false };
let lastSent = 0;

function setCount() {
  const n = remotes.size + (me ? 1 : 0);
  hudCount.textContent = String(n);
  if (me && n <= 1) showHint(`房间暂时只有你 · 房间码 ${hudCode.textContent} · 把链接发给朋友,他们进来就能看到你`);
  else hideHint();
}
function showHint(text) { roomHint.textContent = text; roomHint.style.display = 'block'; }
function hideHint() { roomHint.style.display = 'none'; }

// ---------- 小地图 ----------
// 把房间世界坐标(XZ,范围约 ±29)投影成右下角小地图上的圆点:自身 + 所有远端玩家。
const MINI_SIZE = 132; // 与 room.css 中 #minimap 尺寸一致
const MINI_PAD = 12;
const MINI_R = 29;     // 世界半径(与移动 clamp 一致)
function worldToMini(x, z) {
  const u = MINI_SIZE / 2 + (x / MINI_R) * (MINI_SIZE / 2 - MINI_PAD);
  const v = MINI_SIZE / 2 + (z / MINI_R) * (MINI_SIZE / 2 - MINI_PAD);
  return [u, v];
}
function makeDot(color, self) {
  const d = document.createElement('div');
  d.className = 'mini-dot' + (self ? ' self' : '');
  d.style.background = color;
  if (!self) d.style.boxShadow = `0 0 6px ${color}`;
  minimap.appendChild(d);
  return d;
}
const miniDots = new Map(); // id -> 圆点 DOM
let miniSelf = null;
function updateMinimap() {
  if (!me || !minimap) return;
  if (!miniSelf) miniSelf = makeDot(me.color, true);
  const [sx, sz] = worldToMini(me.x, me.z);
  miniSelf.style.left = sx + 'px';
  miniSelf.style.top = sz + 'px';
  for (const [id, r] of remotes) {
    let d = miniDots.get(id);
    if (!d) { d = makeDot(r.avatar.color, false); miniDots.set(id, d); }
    const [x, z] = worldToMini(r.avatar.group.position.x, r.avatar.group.position.z);
    d.style.left = x + 'px';
    d.style.top = z + 'px';
  }
  for (const [id, d] of miniDots) {
    if (!remotes.has(id)) { d.remove(); miniDots.delete(id); }
  }
}

// ---------- 网络 ----------
let ws = null;
let reconnectTimer = null;
function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  ws = new WebSocket(url);
  showBanner('连接中…', true);
  ws.onopen = () => {
    showBanner('', false);
    ws.send(JSON.stringify({ t: 'join', code: ROOM, name: NAME }));
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    handle(m);
  };
  ws.onclose = () => {
    showBanner('连接断开，重连中…', true);
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 2000);
  };
  ws.onerror = () => {};
}

function handle(m) {
  if (m.t === 'welcome') {
    hudCode.textContent = m.code;
    me = { id: m.id, color: m.color, name: NAME, x: m.x, y: m.y, z: m.z, ry: m.ry };
    me.avatar = makeAvatar(m.color, NAME);
    me.avatar.group.position.set(m.x, m.y, m.z);
    me.avatar.group.rotation.y = m.ry;
    scene.add(me.avatar.group);
    cam.yaw = m.ry;
    for (const p of m.players) addRemote(p);
    setCount();
    // 上报一次初始位置
    sendMove(true);
    return;
  }
  if (m.t === 'join') { addRemote(m); setCount(); return; }
  if (m.t === 'move') {
    const r = remotes.get(m.id);
    if (r) { r.tx = m.x; r.ty = m.y; r.tz = m.z; r.try = m.ry; }
    return;
  }
  if (m.t === 'chat') { addChat(m.name, m.text); return; }
  if (m.t === 'emote') {
    const r = remotes.get(m.id);
    if (r) showEmote(r, m.e);
    return;
  }
  if (m.t === 'leave') {
    const r = remotes.get(m.id);
    if (r) { scene.remove(r.avatar.group); remotes.delete(m.id); setCount(); }
    return;
  }
  if (m.t === 'full') { showBanner('房间已满（上限 8 人）', true); return; }
  if (m.t === 'err') { showBanner('错误：' + m.msg, true); return; }
}

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const avatar = makeAvatar(p.color, p.name);
  avatar.group.position.set(p.x, p.y, p.z);
  avatar.group.rotation.y = p.ry || 0;
  scene.add(avatar.group);
  remotes.set(p.id, { avatar, tx: p.x, ty: p.y, tz: p.z, try: p.ry || 0, emote: null });
}
function emojiTexture(e) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '96px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText({ wave: '👋', point: '👉', sit: '🪑' }[e] || '✨', 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}
function showEmote(r, e) {
  r.avatar.emote.material.map = emojiTexture(e);
  r.avatar.emote.material.needsUpdate = true;
  r.avatar.emote.visible = true;
  r.avatar.emoteTimer = 2;
}
function sendMove(force) {
  if (!me || !ws || ws.readyState !== 1) return;
  const now = performance.now();
  if (!force && now - lastSent < 80) return;
  lastSent = now;
  ws.send(JSON.stringify({ t: 'move', x: me.x, y: me.y, z: me.z, ry: me.ry }));
}

// ---------- 聊天 ----------
function addChat(who, text) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  const w = document.createElement('span');
  w.className = 'who';
  w.textContent = who + '：';
  line.appendChild(w);
  line.appendChild(document.createTextNode(text));
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
  while (chatLog.children.length > 60) chatLog.removeChild(chatLog.firstChild);
}
function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ t: 'chat', text }));
  addChat(NAME, text);
  chatInput.value = '';
}
chatSend.onclick = sendChat;
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

document.querySelectorAll('.emote-btn').forEach((b) => {
  b.onclick = () => {
    const e = b.dataset.e;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'emote', e }));
    if (me) showEmote(me.avatar, e);
  };
});
leaveBtn.onclick = () => { if (ws) ws.close(); location.href = '/lobby.html'; };

// 复制邀请链接(房间码已在 URL 里,朋友打开即可进同一房间)
if (inviteBtn) {
  inviteBtn.onclick = async () => {
    const link = location.href;
    try {
      await navigator.clipboard.writeText(link);
      inviteBtn.textContent = '已复制 ✓';
    } catch (e) {
      inviteBtn.textContent = link;
    }
    setTimeout(() => { inviteBtn.textContent = '复制邀请链接'; }, 2000);
  };
}

// ---------- 输入 ----------
// e.key 可能是 undefined(输入法 composition / 合成事件 / 部分移动端键盘),
// 直接 .toLowerCase() 会抛 TypeError —— 先判空。
addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;
  if (!e.key) return;
  keys[e.key.toLowerCase()] = true;
});
addEventListener('keyup', (e) => {
  if (!e.key) return;
  keys[e.key.toLowerCase()] = false;
});

// 鼠标/触摸拖拽看视角(在画布上)
let dragging = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.yaw -= (e.clientX - lx) * 0.005;
  cam.pitch = Math.max(0.05, Math.min(1.2, cam.pitch + (e.clientY - ly) * 0.004));
  lx = e.clientX; ly = e.clientY;
});
// 滚轮缩放
renderer.domElement.addEventListener('wheel', (e) => {
  camDist = Math.max(4, Math.min(14, camDist + e.deltaY * 0.01));
}, { passive: true });

// 移动端方向键
let camDist = 8;
document.querySelectorAll('.move-pad button').forEach((b) => {
  const d = b.dataset.dir;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); padDir[d] = true; });
  b.addEventListener('pointerup', () => { padDir[d] = false; });
  b.addEventListener('pointerleave', () => { padDir[d] = false; });
});

// ---------- 主循环(独立场景循环) ----------
// 注:room 是独立多人房间页面(自带 renderer/scene,无任何 src 文件 import 本文件),
// 与 gallery 的 LoopManager 是不同运行时上下文,故此处保留自有 rAF,刻意不并入。
// 强行接入 LoopManager 会引入跨场景耦合而无收益(LoopManager 绑定的是 gallery 的 ctx.scene/player/media)。
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (me) {
    const av = me.avatar;
    if (av.mixer) av.mixer.update(dt);
    // 移动意图(相对相机朝向)
    let fx = 0, fz = 0;
    if (keys['w'] || padDir.f) fz += 1;
    if (keys['s'] || padDir.b) fz -= 1;
    if (keys['a'] || padDir.l) fx -= 1;
    if (keys['d'] || padDir.r) fx += 1;
    const px = me.x, pz = me.z;
    if (fx || fz) {
      const len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
      // 相机朝向在世界 XZ 的投影
      const wx = fx * cos + fz * sin;
      const wz = -fx * sin + fz * cos;
      const speed = 6;
      me.x = Math.max(-29, Math.min(29, me.x + wx * speed * dt));
      me.z = Math.max(-29, Math.min(29, me.z + wz * speed * dt));
      me.ry = Math.atan2(wx, wz);
      me.avatar.group.position.set(me.x, me.y, me.z);
      me.avatar.group.rotation.y = me.ry;
      sendMove(false);
    }
    // 滚动:本帧位移换算成轮子绕 X 轴自转,模拟轮滑滑行
    const moved = Math.hypot(me.x - px, me.z - pz);
    if (moved > 1e-4) { av.rollAngle += moved / 0.12; av.wheels.rotation.x = av.rollAngle; }
    // 相机跟随
    const cx = me.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * camDist;
    const cz = me.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * camDist;
    const cy = me.y + 1.2 + Math.sin(cam.pitch) * camDist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.15);
    camera.lookAt(me.x, me.y + 1.2, me.z);
  }
  // 远端插值
  for (const r of remotes.values()) {
    const g = r.avatar.group;
    const pgx = g.position.x, pgz = g.position.z;
    g.position.x += (r.tx - g.position.x) * 0.18;
    g.position.y += (r.ty - g.position.y) * 0.18;
    g.position.z += (r.tz - g.position.z) * 0.18;
    let dr = r.try - g.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    g.rotation.y += dr * 0.18;
    if (r.avatar.mixer) r.avatar.mixer.update(dt);
    const moved = Math.hypot(g.position.x - pgx, g.position.z - pgz);
    if (moved > 1e-4) { r.avatar.rollAngle += moved / 0.12; r.avatar.wheels.rotation.x = r.avatar.rollAngle; }
    if (r.avatar.emoteTimer > 0) {
      r.avatar.emoteTimer -= dt;
      if (r.avatar.emoteTimer <= 0) r.avatar.emote.visible = false;
    }
  }
  updateMinimap();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

connect();
tick();
