// avatar.js — 第三人称角色(终末地「司」GLB 模型)
// 2026-08-30 重写:原 Mixamo FBX 在 Three.js 下有致命兼容问题——
//   FBXLoader 报「skeleton attached to more than one geometry is not supported」,
//   蒙皮失败导致模型塌成平面(用户形容「影子趴在地上 / 纸片人」),
//   且 39MB 单文件、动画还选错成 30 秒的 UE5 姿势。
//   改用游戏级 GLB 模型:6 网格 / 737 骨骼 / 自带贴图,7.7MB(原 39MB)。
//   该模型无动画,改用程序化起伏(走路上下浮动 + 身体微摆)表现移动感。
//
// 授权:CC-BY-4.0,必须署名(见 CREDITS.md)
//   This work is based on "Si / Arknights Endfield"
//   (https://sketchfab.com/3d-models/si-arknights-endfield-304e5f23db204cbd834b44138ca570d7)
//   by Abcxyz51 (https://sketchfab.com/Abcxyz51) licensed under CC-BY-4.0
//   (http://creativecommons.org/licenses/by/4.0/)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';
import { getGameState } from '../core/game-state.js'; // 阶段4:viewMode 运行期写路径收归 gameState.set
const gs = getGameState();

let avatarModel = null; // gltf.scene(内层:承载贴地偏移与程序化起伏)
let thirdReady = false;
let bobT = 0; // 程序化起伏相位
let footOffsetY = 0; // 脚底贴地偏移(setupModel 计算,起伏在其上叠加)

// Cloudflare R2 CDN(浏览器实际读取源)
const CDN = 'https://cdn.cloudbear.cloud/models/avatar/';
const MODEL_URL = CDN + 'si.glb';
const TARGET_HEIGHT = 1.7; // 目标身高(米)

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
    pl.p.x = 0;
    pl.p.z = 45;
    pl.p.y = 1.6;
    pl.y = Math.PI / 2;
    gs.set('viewMode', 1); // 阶段4:经 gameState.set 写回
    thirdReady = true;
    setStatus('第三人称显示中 · 拖动鼠标环绕观看', '#66ff99');
    setTimeout(clearStatus, 3000);
  }
  btn.onclick = function () {
    if (avatarModel) return enterThirdPerson();
    // 按需加载:首次点击才下载模型(7.7MB GLB)
    setStatus('正在加载角色模型…', '#ffcc66');
    ensureAvatar(function () {
      if (avatarModel) enterThirdPerson();
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
    function (gltf) {
      onOk(gltf);
    },
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
        setTimeout(function () {
          loadModel(url, onOk, onFail, attempt + 1);
        }, 3000);
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

  // 自动缩放:按包围盒高度归一到目标身高,不依赖导出单位
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.001) obj.scale.setScalar(TARGET_HEIGHT / size.y);

  // 把模型原点挪到脚底并水平居中(记录在内层 obj 上,见下方 holder 说明)
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;
  obj.position.x -= (box2.min.x + box2.max.x) / 2;
  obj.position.z -= (box2.min.z + box2.max.z) / 2;
  footOffsetY = obj.position.y;

  // 阴影 + 防剔除(骨骼动画包围盒会变,剔除会导致角色突然消失)
  obj.traverse(function (c) {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      c.frustumCulled = false;
    }
  });

  // ⚠️ loop-manager 每帧覆写 ctx.scene.avatar 的 position 与 rotation.y,
  //    直接把 obj 挂上去会把上面的贴地/居中偏移和起伏全部冲掉(角色陷地或飘空)。
  //    故套一层 Group:holder 接受每帧定位,obj 在局部空间保留偏移与动画。
  const holder = new THREE.Group();
  holder.add(obj);

  // 替换旧模型
  var old = ctx.scene.avatar;
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

  holder.visible = ctx.player.viewMode === 1;
  ctx.scene.s.add(holder);
  ctx.scene.avatar = holder;

  window.__avatarLoaded = true;
  setStatus('角色就绪 · 点右下角按钮切换第三人称', '#66ff99');
  setTimeout(clearStatus, 5000);

  // 该模型无动画,起伏/摆动由 avatarTick 程序化驱动
  ctx._avatarTick = avatarTick;
  ctx.onTick(ctx._avatarTick);
}

// ===================== 行走状态 =====================
function isMovingNow() {
  const sm = ctx._playerSM;
  return !!(sm && sm.current && sm.current.name === 'walking');
}

// 程序化起伏:无动画时的移动表现(走路上下浮动 + 身体微摆)
function avatarTick(dt) {
  if (!avatarModel) return;
  const moving = isMovingNow();
  const d = Math.min(dt || 0, 0.1);
  bobT += d * (moving ? 9 : 1.6); // 走路起伏快,待机呼吸慢
  const amp = moving ? 0.045 : 0.012;
  // 起伏叠加在贴地偏移之上;holder 的 y 由 loop-manager 写死,不能动
  avatarModel.position.y = footOffsetY + Math.sin(bobT) * amp;
  // 走路时身体左右微摆,待机时几乎不动
  const sway = moving ? Math.sin(bobT * 0.5) * 0.03 : 0;
  avatarModel.rotation.z = sway;
}

// ===================== 按需加载 =====================
// 模型 7.7MB,只在真正要进第三人称时下载,第一人称玩家零开销
const avatarWaiters = [];
let avatarRequested = false;
/** 幂等:已就绪直接回调,否则下载后回调(失败可重试) */
function ensureAvatar(cb) {
  if (avatarModel) {
    cb && cb();
    return;
  }
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
      avatarRequested = false; // 允许重试
      setStatus('角色加载失败(网络/CDN)。可点击重试', '#ff6666');
    }
  );
}

setTimeout(ensureDemoBtn, 2000);
