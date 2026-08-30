import { ctx } from '../ctx.js';
// kunlun/ark-freeflight-hud.js — 自由飞 HUD/虚拟摇杆/冲刺钮(2026-08-30 B-d 从 ark.js 外迁)
// 纯表现层:DOM 创建、overlay 注册、触摸/鼠标输入采集。
// 物理状态(freeFlight)留在 ark.js,经回调回传;joy 摇杆状态由本模块持有、经 joyGetter 读取。

export function createFlightHUD({ onNav, onHome, onBoostPress, onBoostRelease }) {
  const hud = document.createElement('div');
  hud.id = 'arkHud';
  hud.style.cssText =
    'position:fixed;inset:0;z-index:60;display:none;pointer-events:none;font-family:inherit';
  hud.innerHTML =
    '<div id="ffStats" style="position:absolute;top:14px;left:14px;padding:8px 14px;border-radius:12px;border:1px solid rgba(255,214,130,.45);background:rgba(30,20,10,.55);color:#ffe9c4;font-size:13px;letter-spacing:2px;line-height:1.8"></div>' +
    '<div style="position:absolute;right:16px;bottom:96px;text-align:center">' +
    '<div id="ffBoost" style="width:64px;height:64px;margin:0 auto;border-radius:50%;border:1px solid rgba(255,190,110,.8);background:rgba(60,32,10,.6);color:#ffd76a;font-size:13px;letter-spacing:2px;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none">冲刺</div>' +
    '<div style="margin:8px auto 0;width:110px;height:8px;border-radius:4px;border:1px solid rgba(255,214,130,.5);background:rgba(20,12,6,.6);overflow:hidden"><div id="ffEnergyBar" style="height:100%;width:100%;background:linear-gradient(90deg,#e8a03c,#ffd76a)"></div></div>' +
    '<div style="margin-top:4px;color:rgba(255,233,196,.7);font-size:11px;letter-spacing:3px">灵蕴</div>' +
    '</div>' +
    '<div style="position:absolute;left:50%;bottom:40px;transform:translateX(-50%);display:flex;gap:14px">' +
    '<button id="ffNavBtn" style="padding:10px 20px;border-radius:20px;border:1px solid rgba(124,200,232,.7);background:rgba(14,26,34,.6);color:#cfe9f5;font-size:14px;letter-spacing:3px;cursor:pointer;font-family:inherit;pointer-events:auto">✦ 去展厅</button>' +
    '<button id="ffHomeBtn" style="padding:10px 20px;border-radius:20px;border:1px solid rgba(255,214,130,.6);background:rgba(40,26,12,.6);color:#ffe9c4;font-size:14px;letter-spacing:3px;cursor:pointer;font-family:inherit;pointer-events:auto">↓ 返回地面</button>' +
    '</div>' +
    '<div id="ffJoy" style="position:absolute;left:26px;bottom:90px;width:108px;height:108px;border-radius:50%;border:1px solid rgba(255,214,130,.4);background:rgba(30,20,10,.35);display:none;pointer-events:auto;touch-action:none">' +
    '<div id="ffKnob" style="position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,214,130,.35);border:1px solid rgba(255,214,130,.7)"></div>' +
    '</div>';
  document.body.appendChild(hud);
  const overlayApi = ctx.overlay.register(hud, { touchOnly: true }); // 飞行 HUD:只进触摸白名单;Esc 是飞行逻辑(返回地面),不是关弹层

  const stats = hud.querySelector('#ffStats');
  const energyBar = hud.querySelector('#ffEnergyBar');
  const boost = hud.querySelector('#ffBoost');
  const joyEl = hud.querySelector('#ffJoy');
  const knob = hud.querySelector('#ffKnob');

  hud.querySelector('#ffNavBtn').onclick = () => onNav();
  hud.querySelector('#ffHomeBtn').onclick = () => onHome();

  // 冲刺钮(按住):样式本模块自理,状态经回调回传
  function boostOn(e) {
    e.preventDefault();
    boost.style.background = 'rgba(120,60,16,.75)';
    onBoostPress();
  }
  function boostOff() {
    boost.style.background = 'rgba(60,32,10,.6)';
    onBoostRelease();
  }
  boost.addEventListener('touchstart', boostOn, { passive: false });
  boost.addEventListener('touchend', boostOff);
  boost.addEventListener('touchcancel', boostOff);
  boost.addEventListener('mousedown', boostOn);
  boost.addEventListener('mouseup', boostOff);
  boost.addEventListener('mouseleave', boostOff);

  // 手机虚拟摇杆(左下:推上=爬升,推下=俯冲,左右=倾斜转向)
  const joy = { x: 0, y: 0, id: null };
  if ('ontouchstart' in window) joyEl.style.display = 'block';
  function joyMove(t) {
    const r = joyEl.getBoundingClientRect(),
      cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    let dx = t.clientX - cx,
      dy = t.clientY - cy;
    const m = Math.hypot(dx, dy),
      max = 40;
    if (m > max) {
      dx *= max / m;
      dy *= max / m;
    }
    joy.x = dx / max;
    joy.y = dy / max;
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  joyEl.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joy.id = t.identifier;
      joyMove(t);
    },
    { passive: false }
  );
  joyEl.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === joy.id) joyMove(t);
      }
    },
    { passive: false }
  );
  function joyEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joy.id) {
        joy.id = null;
        joy.x = 0;
        joy.y = 0;
        knob.style.transform = '';
      }
    }
  }
  joyEl.addEventListener('touchend', joyEnd);
  joyEl.addEventListener('touchcancel', joyEnd);

  return {
    el: hud,
    overlayApi,
    stats,
    energyBar,
    joy, // 活引用:freeTick 每帧读取 joy.x/joy.y
    show() {
      hud.style.display = 'block';
    },
    hide() {
      hud.style.display = 'none';
    },
  };
}
