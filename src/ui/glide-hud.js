// ui/glide-hud.js — 滑翔能量 HUD(顶部五格)+ 跳跃按钮(2026-08-30 B4 从 scene/player.js 外迁)
// 纯表现层:DOM 创建与样式;物理状态经回调回传 player.js,能量经 update(pl) 每帧刷新。
// 2026-09-06 主人定:新增 ▼ 下降按钮——小世界太空模式此前只有 ▲ 能升不能降(手机无法下来);
// ▼ 默认隐藏,进入非主世界由 scene-manager 显示,回主世界隐藏(主世界没有"下降"概念)。

export function createGlideHUD({ onJumpPress, onJumpRelease, onDescendPress, onDescendRelease }) {
  // ---- 滑翔能量 HUD(顶部中央五格,原版样式:细条+回充脉冲) ----
  const glideHud = document.createElement('div');
  glideHud.style.cssText =
    'position:fixed;top:70px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:35;pointer-events:none';
  const glidePips = [];
  for (let i = 0; i < 5; i++) {
    const pip = document.createElement('div');
    pip.className = 'glide-pip';
    glideHud.appendChild(pip);
    glidePips.push(pip);
  }
  document.body.appendChild(glideHud);

  // ---- 跳跃按钮(按住滑翔) ----
  const jumpBtn = document.createElement('button');
  jumpBtn.id = 'jumpBtnGlide';
  jumpBtn.textContent = '▲';
  jumpBtn.title = '跳跃(按住滑翔)';
  jumpBtn.style.cssText =
    'position:fixed;bottom:30px;right:20px;z-index:35;width:110px;height:110px;border-radius:50%;border:1px solid rgba(255,220,150,0.4);background:rgba(40,25,10,0.55);color:#ffe4b5;font-size:34px;cursor:pointer;font-family:inherit';
  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onJumpPress();
    jumpBtn.style.transform = 'scale(0.9)';
  });
  jumpBtn.addEventListener('touchend', () => {
    onJumpRelease();
    jumpBtn.style.transform = '';
  });
  let mouseHeld = false; // 防按住拖出后 window mouseup 与按钮 mouseup 双触发重复回传
  jumpBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    mouseHeld = true;
    onJumpPress();
    jumpBtn.style.transform = 'scale(0.9)';
  });
  // 终审修补:按住拖出按钮再松开,按钮自身 mouseup 不触发 → window 级兜底释放
  window.addEventListener('mouseup', () => {
    if (mouseHeld) {
      mouseHeld = false;
      onJumpRelease();
    }
  });
  jumpBtn.addEventListener('mouseup', () => {
    if (mouseHeld) {
      mouseHeld = false;
      onJumpRelease();
    }
  });
  document.body.appendChild(jumpBtn);

  // ---- 下降按钮(太空模式专属;与 ▲ 同款对称,默认隐藏) ----
  const descendBtn = document.createElement('button');
  descendBtn.id = 'descendBtnSpace';
  descendBtn.textContent = '▼';
  descendBtn.title = '下降(按住)';
  descendBtn.style.cssText =
    'position:fixed;bottom:30px;right:140px;display:none;z-index:35;width:110px;height:110px;border-radius:50%;border:1px solid rgba(150,200,255,0.4);background:rgba(10,25,40,0.55);color:#cfe8ff;font-size:34px;cursor:pointer;font-family:inherit';
  descendBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (onDescendPress) onDescendPress();
    descendBtn.style.transform = 'scale(0.9)';
  });
  descendBtn.addEventListener('touchend', () => {
    if (onDescendRelease) onDescendRelease();
    descendBtn.style.transform = '';
  });
  let downHeld = false; // 与 jumpBtn 同款:按住拖出后 window mouseup 兜底释放
  descendBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    downHeld = true;
    if (onDescendPress) onDescendPress();
    descendBtn.style.transform = 'scale(0.9)';
  });
  window.addEventListener('mouseup', () => {
    if (downHeld) {
      downHeld = false;
      if (onDescendRelease) onDescendRelease();
    }
  });
  descendBtn.addEventListener('mouseup', () => {
    if (downHeld) {
      downHeld = false;
      if (onDescendRelease) onDescendRelease();
    }
  });
  document.body.appendChild(descendBtn);

  return {
    /** 每帧刷新:pl 为 ctx.player.pl(滑翔能量/落地/滑翔态) */
    update(pl) {
      const n = Math.ceil(Math.max(0, pl.glideEnergy / 5) * 5);
      glidePips.forEach((pip, i) => {
        pip.classList.toggle('active', i < n);
        pip.classList.toggle('recharge', pl.onGround && i >= n);
      });
      jumpBtn.classList.toggle('gliding', pl.gliding);
    },
  };
}
