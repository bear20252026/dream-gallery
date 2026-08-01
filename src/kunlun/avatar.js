// avatar.js — Mixamo 角色(FBX+贴图)替换胶囊人，第三人称显示
// 2026-08-01 重构:直接 FBXLoader 加载(有色+动画),第三人称相机后上方+360°环绕(对标原神跑图)
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ctx } from '../ctx.js';

let avatarModel = null;
let mixer = null;
let walkAction = null;
let thirdReady = false; // 是否进入过第三人称

const MODEL_URL = 'https://cdn.cloudbear.cloud/models/avatar/walk2.fbx';

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
    ctx.player.viewMode = 1;
    thirdReady = true;
    setStatus('第三人称显示中 · 拖动鼠标环绕观看', '#66ff99');
    setTimeout(clearStatus, 3000);
  };
  document.body.appendChild(btn);
}

function loadWithRetry(attempt) {
  setStatus('角色加载中' + (attempt > 1 ? '(第' + attempt + '次) ' : '') + ' 0%', '#ffcc66');
  new FBXLoader().load(
    MODEL_URL,
    function (obj) {
      console.log('[avatar] FBX 加载完成');
      try {
        setupModel(obj);
        window.__avatarLoaded = true;
        setStatus('角色就绪 · 可点右下角按钮或按 V', '#66ff99');
        setTimeout(clearStatus, 5000);
      } catch (e) {
        console.error('[avatar] 初始化异常:', e);
        setStatus('角色初始化出错: ' + (e.message || e), '#ff6666');
      }
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
          loadWithRetry(attempt + 1);
        }, 3000);
      } else {
        window.__avatarFailed = true;
        setStatus('角色加载失败(网络/CDN)。可刷新重试', '#ff6666');
      }
    }
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

  // 动画:取第一个 clip(循环走路),命名为 walk,一直播放
  if (obj.animations && obj.animations.length) {
    const clip = obj.animations.find((a) => a.duration > 0.1) || obj.animations[0];
    mixer = new THREE.AnimationMixer(obj);
    walkAction = mixer.clipAction(clip);
    walkAction.play(); // 持续播放走路动画
    console.log('[avatar] 动画:', clip.name, clip.duration.toFixed(1) + 's');
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

  // 帧更新:只负责动画播放 + 角色朝向(位置/可见性/相机 由 main.js 主循环接管)
  // main.js 已实现第三人称相机(后上方) + avatar.position.copy(pl.p) + visible 控制,
  // 这里再写一套会打架(导致角色不可见),所以只做动画
  ctx._avatarTick = function (dt) {
    if (!avatarModel) return;
    if (mixer) mixer.update(dt); // 仅推进走路动画;朝向/位置/可见性由 main.js 主循环统一接管(单一 owner)
  };
  ctx.onTick(ctx._avatarTick);
}

// 等场景就绪 + 挂按钮
setTimeout(function () {
  ensureDemoBtn();
  function start() {
    if (ctx.scene.s) {
      loadWithRetry(1);
    } else setTimeout(start, 200);
  }
  start();
}, 2000);
