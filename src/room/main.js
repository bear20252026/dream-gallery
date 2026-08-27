// src/room/main.js — 小房间客户端:three 场景 + 多人同步 + 聊天 + 表情
import * as THREE from 'three';
import './room.css';

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

function makeAvatar(color, name) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), bodyMat);
  body.position.y = 0.8;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    new THREE.MeshStandardMaterial({ color: '#fff3ea', roughness: 0.5 })
  );
  head.position.y = 1.55;
  group.add(head);
  // 昵称牌
  const tag = makeTag(name, 'rgba(20,12,28,0.78)');
  tag.position.y = 2.15;
  group.add(tag);
  // 表情牌(默认隐藏)
  const emote = makeTag('', null);
  emote.position.y = 2.6;
  emote.visible = false;
  group.add(emote);
  return { group, body, tag, emote, emoteTimer: 0 };
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
addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;
  keys[e.key.toLowerCase()] = true;
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

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

// ---------- 主循环 ----------
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (me) {
    // 移动意图(相对相机朝向)
    let fx = 0, fz = 0;
    if (keys['w'] || padDir.f) fz += 1;
    if (keys['s'] || padDir.b) fz -= 1;
    if (keys['a'] || padDir.l) fx -= 1;
    if (keys['d'] || padDir.r) fx += 1;
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
    g.position.x += (r.tx - g.position.x) * 0.18;
    g.position.y += (r.ty - g.position.y) * 0.18;
    g.position.z += (r.tz - g.position.z) * 0.18;
    let dr = r.try - g.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    g.rotation.y += dr * 0.18;
    if (r.avatar.emoteTimer > 0) {
      r.avatar.emoteTimer -= dt;
      if (r.avatar.emoteTimer <= 0) r.avatar.emote.visible = false;
    }
  }
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
