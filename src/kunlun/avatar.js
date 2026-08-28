// avatar.js — Mixamo 角色(FBX+贴图)替换胶囊人，第三人称显示
// 2026-08-02 重构:加载 walk-relaxed start/loop/end 三套动画,
// 由玩家状态机(idle/walking)驱动「起步→循环→收步」状态机 + crossfade 过渡(对标原神行走手感)
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ctx } from '../ctx.js';
import { getGameState } from '../core/game-state.js'; // 阶段4:viewMode 运行期写路径收归 gameState.set(写回经 set 陷阱发事件)
const gs = getGameState();

let avatarModel = null;
let mixer = null;
let loopAction = null; // 循环走路(常态)
let startAction = null; // 起步(一次)
let endAction = null; // 收步(一次)
let extraLoaded = false; // start/end 是否已加载
let extraLoading = false;
let thirdReady = false; // 是否进入过第三人称
let curAnim = 'none'; // none|start|loop|end
let wasMoving = false;

// Cloudflare R2 CDN(浏览器实际读取源)
const CDN = 'https://cdn.cloudbear.cloud/models/avatar/';
const LOOP_URL = CDN + 'walk-relaxed-loop-378936.fbx';
const START_URL = CDN + 'walk-relaxed-start-378926.fbx';
const END_URL = CDN + 'walk-relaxed-end-378960.fbx';

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
  btn.onclick = function () {
    if (!avatarModel) {
      setStatus('角色未加载好,请稍候', '#ff6666');
      return;
    }
    var pl = ctx.player.pl;
    pl.p.x = 0;
    pl.p.z = 45;
    pl.p.y = 1.6;
    pl.y = Math.PI / 2;
    gs.set('viewMode', 1); // 阶段4:经 gameState.set 写回(读者 ctx.player.viewMode 经 vault 同步)
    thirdReady = true;
    setStatus('第三人称显示中 · 拖动鼠标环绕观看', '#66ff99');
    setTimeout(clearStatus, 3000);
  };
  document.body.appendChild(btn);
}

// ===================== FBX 加载 =====================
function loadFbx(url, onOk, onFail, attempt) {
  attempt = attempt || 1;
  setStatus('角色加载中' + (attempt > 1 ? '(第' + attempt + '次) ' : '') + ' 0%', '#ffcc66');
  new FBXLoader().load(
    url,
    function (obj) {
      onOk(obj);
    },
    function (xhr) {
      if (xhr.total > 0) {
        var pct = Math.round((xhr.loaded / xhr.total) * 100);
        setStatus('角色加载中 ' + pct + '%');
        if (pct % 20 === 0) console.log('[avatar] 加载 ' + pct + '%');
      }
    },
    function (err) {
      console.warn('[avatar] 加载失败(第' + attempt + '次):', err && err.message);
      if (attempt < 3) {
        setStatus('加载失败，' + (3 - attempt) + ' 秒后重试...', '#ff6666');
        setTimeout(function () {
          loadFbx(url, onOk, onFail, attempt + 1);
        }, 3000);
      } else {
        onFail && onFail(err);
      }
    }
  );
}

// 懒加载 start/end 两套 clip(进第三人称才触发,避免首屏多下 80MB)
function ensureExtraClips() {
  if (extraLoaded || extraLoading || !mixer) return;
  extraLoading = true;
  setStatus('加载行走动画(起步/收步)…', '#ffcc66');
  var pending = 2;
  function done() {
    if (--pending === 0) {
      extraLoaded = true;
      setStatus('行走动画就绪', '#66ff99');
      setTimeout(clearStatus, 2000);
    }
  }
  loadFbx(
    START_URL,
    function (o) {
      var c = o.animations && o.animations[0];
      if (c) {
        startAction = mixer.clipAction(c);
        startAction.loop = THREE.LoopOnce;
        startAction.clampWhenFinished = true;
      }
      done();
    },
    done
  );
  loadFbx(
    END_URL,
    function (o) {
      var c = o.animations && o.animations[0];
      if (c) {
        endAction = mixer.clipAction(c);
        endAction.loop = THREE.LoopOnce;
        endAction.clampWhenFinished = true;
      }
      done();
    },
    done
  );
}

function setupModel(obj) {
  avatarModel = obj;

  // 缩放:FBX 局部 ~150 单位 × 0.012 ≈ 1.8 米
  obj.scale.set(0.012, 0.012, 0.012);
  obj.rotation.y = Math.PI;

  // 阴影 + 防剔除 + 保留贴图(有色)
  obj.traverse(function (c) {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      c.frustumCulled = false;
    }
  });

  // 动画:取 loop clip 作为循环主体;start/end 由 ensureExtraClips 异步补充
  if (obj.animations && obj.animations.length) {
    const clip = obj.animations.find((a) => a.duration > 0.1) || obj.animations[0];
    mixer = new THREE.AnimationMixer(obj);
    loopAction = mixer.clipAction(clip);
    loopAction.loop = THREE.LoopRepeat;
    console.log('[avatar] loop 动画:', clip.name, clip.duration.toFixed(1) + 's');
    // 起步/收步播完的衔接:start 结束→若仍在走则转 loop,否则转 end
    mixer.addEventListener('finished', function (e) {
      if (e.action === startAction) {
        if (isMovingNow()) setAnim('loop', 0.2);
        else setAnim('end', 0.2);
      }
      // end 结束:clampWhenFinished 自动保持末帧(站立),无需处理
    });
  }

  // 替换旧 avatar
  var old = ctx.scene.avatar;
  if (old && old !== obj) {
    ctx.scene.s.remove(old);
    old.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }

  // 头顶红球标记(确认可见)
  var marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff3366,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    })
  );
  marker.position.y = 2.1;
  marker.renderOrder = 999;
  obj.add(marker);

  obj.visible = ctx.player.viewMode === 1;
  ctx.scene.s.add(obj);
  ctx.scene.avatar = obj;

  window.__avatarLoaded = true;
  setStatus('角色就绪 · 可点右下角按钮或按 V', '#66ff99');
  setTimeout(clearStatus, 5000);

  // 帧更新:仅推进动画 + 行走状态机(位置/可见性/相机 由 main.js 主循环接管)
  ctx._avatarTick = avatarTick;
  ctx.onTick(ctx._avatarTick);
}

// ===================== 行走状态机 =====================
function isMovingNow() {
  const sm = ctx._playerSM;
  return !!(sm && sm.current && sm.current.name === 'walking');
}

// 切到指定动画(带 crossfade),其余淡出
function setAnim(name, fade) {
  const map = { start: startAction, loop: loopAction, end: endAction };
  const next = map[name];
  if (!next) return false;
  ['start', 'loop', 'end'].forEach(function (k) {
    const a = map[k];
    if (a && k !== name && a.isRunning()) a.fadeOut(fade);
  });
  next.reset();
  next.setEffectiveWeight(1);
  next.fadeIn(fade);
  next.play();
  curAnim = name;
  return true;
}

function avatarTick(dt) {
  if (!mixer) return;
  mixer.update(dt);
  if (!avatarModel) return;

  // 进第三人称才懒加载 start/end
  if (ctx.player.viewMode === 1) ensureExtraClips();

  const moving = isMovingNow();

  if (!extraLoaded) {
    // 兜底:仅 loop 可用时,走播 loop,停则淡出(保持模型默认站姿)
    if (moving) {
      if (curAnim !== 'loop') setAnim('loop', 0.2);
    } else if (loopAction && loopAction.isRunning()) {
      loopAction.fadeOut(0.2);
      curAnim = 'idle';
    }
    wasMoving = moving;
    return;
  }

  if (moving && !wasMoving) {
    // 起步:先播 start(一次)
    setAnim('start', 0.12);
  } else if (!moving && wasMoving) {
    // 收步:播 end(一次)→ 保持站立末帧
    setAnim('end', 0.12);
  } else if (moving && wasMoving) {
    // 持续行走:start 结束会自动转 loop;若曾中断(如 end 态)则补回 loop
    if (curAnim === 'end') setAnim('loop', 0.2);
  } else if (!moving && !wasMoving) {
    // 待机:确保是 end 站立末帧(首次进入时由 none 切到 end)
    if (curAnim !== 'end' && curAnim !== 'start') setAnim('end', 0.2);
  }
  wasMoving = moving;
}

// ===================== 启动 =====================
function start() {
  if (ctx.scene.s) {
    loadFbx(LOOP_URL, setupModel, function () {
      window.__avatarFailed = true;
      setStatus('角色加载失败(网络/CDN)。可刷新重试', '#ff6666');
    });
  } else setTimeout(start, 200);
}

setTimeout(function () {
  ensureDemoBtn();
  start();
}, 2000);
