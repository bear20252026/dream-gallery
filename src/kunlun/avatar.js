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
import { expose } from '../debug-hooks.js';

let avatarHolder = null; // Group:loop-manager 每帧写入 position/rotation
let avatarModel = null; // gltf.scene(内层:贴地偏移与动画)
let mixer = null;       // AnimationMixer
let clips = null;       // { loop, start?, end? } AnimationClip
let stateAnim = null;   // 当前 loop Action
const CDN = 'https://cdn.cloudbear.cloud/models/avatar/';
// 单 GLB 含走路循环;start/end 留接口,后续按需加
const MODEL_URL = CDN + 'catwalk/catwalk-loop-378982.glb';
const TARGET_HEIGHT = 1.7;
const IDLE_TIME_SCALE = 0.15; // 静止时慢速播放(呼吸感),避免定格绑定姿势

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

// ===================== 视角模式监听(唯一入口) =====================
// 2026-08-30:不再自建按钮。项目本来就有两个切换入口——
//   - V 键        (scene/player.js:262)
//   - #viewBtn    (scene/player.js:266,界面上的「人称」按钮)
// 之前 avatar.js 又加了第三个「🎭 第三人称」按钮,导致入口分裂:
//   点原按钮只切视角(看到的是 player.js 的胶囊小人),点新按钮才下载真人模型。
// 现改为:订阅 viewMode,无论从哪个入口切到第三人称,都自动按需加载真人模型。
// 加载完成后 setupModel 会把胶囊小人(旧 ctx.scene.avatar)移除并换成真人模型。
function watchViewMode() {
  let prompting = false;
  ctx.onTick(function () {
    // 已加载好 / 或不在第三人称 → 什么都不做
    if (avatarHolder || ctx.player.viewMode !== 1) {
      prompting = false;
      return;
    }
    if (avatarRequested) return; // 正在下载,等它完成
    if (!prompting) {
      prompting = true;
      setStatus('正在加载角色模型…', '#ffcc66');
    }
    ensureAvatar(function () {
      prompting = false;
      setStatus('角色已就绪', '#66ff99');
      setTimeout(clearStatus, 2500);
    });
  });
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

// ===================== 无缝循环 =====================
// 两个接缝来源(实测 scripts/probe/check-seam.cjs 对线上 GLB 的解析):
// 1) 导出链路(Blender/FBX)常在循环动画首尾各放同一关键帧:
//    LoopRepeat 播到尾帧(=首帧姿势)再跳回首帧 → 同一姿势连播两帧,每圈顿挫。
//    → 裁掉数值完全一致的尾关键帧。
// 2) ActorCore 台步带"根运动":CC_Base_Hip 的 translation 一个循环漂移
//    [x 0.17, y 1.39, z 5.19]米 —— LoopRepeat 下模型每 1.3s 前冲又瞬移回来,
//    这是"循环卡顿"的真正主因。
//    → 位移轨道去趋势:逐分量减去 linear(尾-首)*(t/dur),保留摆动/起伏(原位化)。
function makeSeamlessLoop(clip) {
  try {
    const dur = clip.duration;
    if (!dur) return clip;
    // —— 1) 位移轨道去根运动(原位化) ——
    for (const tr of clip.tracks) {
      const n = tr.times.length;
      if (n < 2 || !tr.name.endsWith('.position')) continue;
      const vs = tr.values.length / n;
      if (vs !== 3) continue;
      let drift = 0;
      for (let k = 0; k < 3; k++) {
        drift = Math.max(drift, Math.abs(tr.values[k] - tr.values[(n - 1) * 3 + k]));
      }
      if (drift < 0.05) continue; // 无明显根运动,不动(纯 Y 起伏等)
      for (let k = 0; k < 3; k++) {
        const d = tr.values[(n - 1) * 3 + k] - tr.values[k];
        for (let i = 0; i < n; i++) {
          tr.values[i * 3 + k] -= d * (tr.times[i] / dur);
        }
      }
    }
    // —— 2) 裁掉首尾完全一致的尾关键帧 ——
    let cut = false;
    for (const tr of clip.tracks) {
      const n = tr.times.length;
      if (n < 2) continue;
      if (Math.abs(tr.times[n - 1] - dur) > 1e-4) continue;
      const vs = tr.values.length / n;
      let same = true;
      for (let k = 0; k < vs; k++) {
        const a = tr.values[k], b = tr.values[(n - 1) * vs + k];
        if (Math.abs(a - b) > 1e-4 * Math.max(1, Math.abs(a))) { same = false; break; }
      }
      if (same) {
        tr.times = tr.times.slice(0, n - 1);
        tr.values = tr.values.slice(0, (n - 1) * vs);
        cut = true;
      }
    }
    if (cut) {
      let m = 0;
      for (const tr of clip.tracks) {
        if (tr.times.length) m = Math.max(m, tr.times[tr.times.length - 1]);
      }
      if (m > 0.1) clip.duration = m;
    }
    return clip;
  } catch (e) {
    console.warn('[avatar] 无缝化失败,按原片循环:', e && e.message);
    return clip;
  }
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
    obj.scale.setScalar(TARGET_HEIGHT / size.y);
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

  // AnimationMixer:走路循环一个 clip 搞定两态 ——
  //   移动中: timeScale=1   正常步频
  //   静止时: timeScale≈0.15 慢速"呼吸"摆动(避免淡出到绑定姿势 = A-pose 定格,
  //           用户看到的"没有走动动画/卡住"就是静止时 fadeOut 后骨架回到 bind pose)
  // 之前还设计了 start/end 状态机,但 CDN 只上传了 loop 一套 GLB,
  // clips.end 不存在 → setState('idle') 淡出所有动作 → 定格绑定姿势。
  mixer = new THREE.AnimationMixer(obj);
  // Blender 导出的 GLB 有 2 个 animation: [0]=Armature|* 主动画 [1]=Key|* morph 噪声
  const usable = gltf.animations.filter((c) => c.tracks.length > 1 && c.duration > 0.1);
  clips = { loop: makeSeamlessLoop(usable[0]) };
  if (usable.length > 1) clips.start = usable[1];
  const act = mixer.clipAction(clips.loop);
  act.loop = THREE.LoopRepeat;
  act.timeScale = IDLE_TIME_SCALE; // 出生时多半静止:先慢速
  act.play();
  stateAnim = act;

  expose('avatarLoaded', true);
  expose('avatarClips', clips);
  setStatus('角色就绪 · 按 V 或点「人称」切换视角', '#66ff99');
  setTimeout(clearStatus, 5000);

  // 注册帧 tick:推进 mixer 并按移动状态调速
  ctx._avatarTick = avatarTick;
  ctx.onTick(ctx._avatarTick);
}

// ===================== 行走状态 =====================
function isMovingNow() {
  const sm = ctx._playerSM;
  return !!(sm && sm.current && sm.current.name === 'walking');
}

// ===================== 动画 tick =====================
// 只有一个 loop clip,用 timeScale 平滑表达"走路 / 静止呼吸"两态:
//   timeScale 逐帧向目标插值(走路 1,静止 0.15),切换无跳变。
// 第一人称(holder 不可见)直接跳过,省掉每帧 101 骨骼的蒙皮矩阵计算。
function avatarTick(dt) {
  if (!mixer || !avatarHolder) return;
  if (!avatarHolder.visible) return; // 第一人称:模型不渲染也不算动画
  const moving = isMovingNow();
  const target = moving ? 1 : IDLE_TIME_SCALE;
  if (stateAnim) {
    // 低帧率下 dt 被钳到 0.1,插值系数用固定比例即可,肉眼平滑
    const t = stateAnim.timeScale + (target - stateAnim.timeScale) * 0.12;
    stateAnim.timeScale = Math.abs(t - target) < 0.01 ? target : t;
  }
  mixer.update(Math.min(dt || 0, 0.1));
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
      expose('avatarFailed', true);
      avatarRequested = false;
      setStatus('角色加载失败(网络/CDN)。可点击重试', '#ff6666');
    }
  );
}

// 延迟挂载:等 ctx/player 就绪后再开始监听视角模式
setTimeout(watchViewMode, 2000);