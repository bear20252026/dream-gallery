// avatar.js — 第三人称角色(ActorCore catwalk 模型,GLB 格式)
// 2026-08-30 改用 Blender 导出的 catwalk GLB:
//   - 解决 FBXLoader 的 ">4 weights 被砍" 问题(蒙皮完全正确)
//   - 自带专业动捕走路循环(loop) + 起步(start) + 收步(end)
//   - WebP 贴图,101 根标准 CC_Base 骨骼,6.4MB/套
// 授权:由用户提供的 ActorCore/AccuRig 资源(非 CC-BY,可商用情况由用户确认)
//   原作者与授权以你提供的下载来源为准
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';
import { getGameState } from '../core/game-state.js';
const gs = getGameState();

let avatarHolder = null; // Group:loop-manager 每帧写入 position/rotation
let avatarModel = null; // gltf.scene(内层:贴地偏移与动画)
let mixer = null;       // AnimationMixer
let clips = null;       // { start, loop, end } AnimationClip
let lastMoving = false; // 上一帧是否在走,用于检测状态切换
let stateAnim = null;   // 当前播放的 Action
let stateName = 'idle'; // idle | start | loop | end
let endStartT = 0;      // end 动画起始时间(用于播完后切回 idle)
let initScale = 1;      // 模型当前缩放(供 position 调整时复用)

const CDN = 'https://cdn.cloudbear.cloud/models/avatar/';
// 单 GLB 含走路循环;start/end 留接口,后续按需加
const MODEL_URL = CDN + 'catwalk/catwalk-loop-378982.glb';
const TARGET_HEIGHT = 1.7;
const FADE = 0.25; // 动画切换淡入淡出时长(秒)

// ===================== 状态条 + 看自己按钮 =====================
let statusEl = null;
function setStatus(msg, color) {
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:20px;background:rgba(20,10,30,.85);color:#fff;font:13px/1.4 system-ui;border:1px solid rgba(255,255,255,.2);box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;transition:opacity .4s;white-space:nowrap';
    document.body.appendChild(statusEl);
  }
  statusEl.textContent = msg;
  statusEl.style.borderColor = color || 'rgba(255,255,255,.2)';
  statusEl.style.opacity = '1';
}
function clearStatus() {
  if (statusEl) statusEl.style.opacity = '0';
}

function ensureDemoBtn() {
  if (document.getElementById('avatar-demo-btn')) return;
  var btn = document.createElement('button');
  btn.id = 'avatar-demo-btn';
  btn.textContent = '🎭 第三人称';
  btn.style.cssText =
    'position:fixed;bottom:80px;right:16px;z-index:9999;padding:10px 16px;border-radius:22px;background:linear-gradient(135deg,#ff6b9d,#a855f7);color:#fff;font:bold 14px/1 system-ui;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(168,85,247,.5)';

  function enterThirdPerson() {
    var pl = ctx.player.pl;
    pl.p.x = 0; pl.p.z = 45; pl.p.y = 1.6; pl.y = Math.PI / 2;
    gs.set('viewMode', 1);
    setStatus('第三人称显示中 · 拖动鼠标环绕观看', '#66ff99');
    setTimeout(clearStatus, 3000);
  }
  btn.onclick = function () {
    if (avatarHolder) return enterThirdPerson();
    setStatus('正在加载角色模型…', '#ffcc66');
    ensureAvatar(function () {
      if (avatarHolder) enterThirdPerson();
    });
  };
  document.body.appendChild(btn);
}

// ===================== GLB 加载 =====================
function loadModel(url, onOk, onFail, attempt) {
  attempt = attempt || 1;
  setStatus('角色加载中' + (attempt > 1 ? '(第' + attempt + '次) ' : '') + ' 0%', '#ffcc66');
  new GLTFLoader().load(
    url,
    function (gltf) { onOk(gltf); },
    function (xhr) {
      if (xhr.total > 0) {
        var pct = Math.round((xhr.loaded / xhr.total) * 100);
        setStatus('角色加载中 ' + pct + '%');
      }
    },
    function (err) {
      console.warn('[avatar] 加载失败(第' + attempt + '次):', err && err.message);
      if (attempt < 3) {
        setStatus('加载失败，' + (3 - attempt) + ' 秒后重试...', '#ff6666');
        setTimeout(function () { loadModel(url, onOk, onFail, attempt + 1); }, 3000);
      } else {
        onFail && onFail(err);
      }
    }
  );
}

// ===================== 模型装配 =====================
function setupModel(gltf) {
  const obj = gltf.scene;
  avatarModel = obj;

  // 缩放到目标身高
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  if (size.y > 0.001) {
    initScale = TARGET_HEIGHT / size.y;
    obj.scale.setScalar(initScale);
  }
  obj.updateMatrixWorld(true);

  // 脚底贴地 + 水平居中(在 holder 局部空间,loop-manager 写入 holder.position)
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;
  obj.position.x -= (box2.min.x + box2.max.x) / 2;
  obj.position.z -= (box2.min.z + box2.max.z) / 2;

  // 阴影 + 防剔除
  obj.traverse(function (c) {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      c.frustumCulled = false;
    }
  });

  // ⚠️ loop-manager 每帧覆写 ctx.scene.avatar 的 position 与 rotation.y,
  //    直接挂载会冲掉上面的贴地偏移和动画位置。套一层 Group 解决。
  const holder = new THREE.Group();
  holder.add(obj);

  // 替换旧模型
  const old = ctx.scene.avatar;
  if (old && old !== obj) {
    ctx.scene.s.remove(old);
    old.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of ms) m.dispose();
      }
    });
  }

  avatarHolder = holder;
  holder.visible = ctx.player.viewMode === 1;
  ctx.scene.s.add(holder);
  ctx.scene.avatar = holder;

  // AnimationMixer:目前只用了走路循环(loop),start/end 留接口后续扩展
  mixer = new THREE.AnimationMixer(obj);
  // Blender 导出的 GLB 有 2 个 animation: [0]=Armature|* 主动画 [1]=Key|* morph 噪声
  // 取第一个有意义的(morph 时长 0 会被 mixer 报 empty)
  const usable = gltf.animations.filter((c) => c.tracks.length > 1 && c.duration > 0.1);
  clips = { loop: usable[0] };
  if (usable.length > 1) clips.start = usable[1];
  // 标记走为默认播放
  const act = mixer.clipAction(clips.loop);
  act.loop = THREE.LoopRepeat;
  act.play();
  stateAnim = act;
  stateName = 'loop';
  lastMoving = true; // 强制进入下一帧的"state change"分支

  window.__avatarLoaded = true;
  window.__avatarClips = clips;
  setStatus('角色就绪 · 点右下角按钮切换第三人称', '#66ff99');
  setTimeout(clearStatus, 5000);

  // 注册帧 tick:推进 mixer 并按移动状态切换动作
  ctx._avatarTick = avatarTick;
  ctx.onTick(ctx._avatarTick);
}

// ===================== 行走状态 =====================
function isMovingNow() {
  const sm = ctx._playerSM;
  return !!(sm && sm.current && sm.current.name === 'walking');
}

// 切到目标 clip(start / loop / end / idle)
function setState(next) {
  if (!mixer || !clips || next === stateName) return;
  // idle: 全部淡出
  if (next === 'idle') {
    if (stateAnim) stateAnim.fadeOut(FADE);
    stateAnim = null;
    stateName = 'idle';
    return;
  }
  const clip = clips[next];
  if (!clip) return;
  const act = mixer.clipAction(clip);
  act.reset();
  act.setLoop(next === 'loop' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  act.clampWhenFinished = (next === 'end' || next === 'start');
  act.fadeIn(FADE);
  if (stateAnim) stateAnim.fadeOut(FADE);
  stateAnim = act;
  stateName = next;
  if (next === 'end') endStartT = performance.now() / 1000;
}

// 动画 tick:推 mixer + 切换状态
function avatarTick(dt) {
  if (!mixer) return;
  const d = Math.min(dt || 0, 0.1);
  mixer.update(d);

  const moving = isMovingNow();
  // 状态机:基于 moving 变化 + end 动画播完
  if (moving) {
    // 静止→开始:start(有则用,否则 loop)
    if (stateName === 'idle' || stateName === 'end') {
      setState(clips.start ? 'start' : 'loop');
    } else if (stateName === 'start' && stateAnim && stateAnim.isRunning() === false) {
      // start 播完 → loop
      setState('loop');
    }
  } else {
    // 移动→停止:end(有则用,否则 idle)
    if (stateName === 'loop' || stateName === 'start') {
      setState(clips.end ? 'end' : 'idle');
    } else if (stateName === 'end' && stateAnim && stateAnim.isRunning() === false) {
      // end 播完 → idle
      setState('idle');
    }
  }
  lastMoving = moving;
}

// ===================== 按需加载 =====================
const avatarWaiters = [];
let avatarRequested = false;
function ensureAvatar(cb) {
  if (avatarHolder) { cb && cb(); return; }
  if (cb) avatarWaiters.push(cb);
  if (avatarRequested) return;
  avatarRequested = true;
  loadModel(
    MODEL_URL,
    function (gltf) {
      setupModel(gltf);
      const ws = avatarWaiters.splice(0);
      for (const w of ws) w();
    },
    function () {
      window.__avatarFailed = true;
      avatarRequested = false;
      setStatus('角色加载失败(网络/CDN)。可点击重试', '#ff6666');
    }
  );
}

setTimeout(ensureDemoBtn, 2000);