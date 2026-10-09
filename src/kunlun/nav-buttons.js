// nav-buttons.js — 太空世界上下文导航按钮(2026-10-10 自 planets.js 切出,逐字迁移)
// B612=回主世界/去下一站;星球=继续旅途/回 B612/回主世界。诚实指引(只指已建成站)。
// deps 注入:worldManager/chapter 是 planets.js 的可变状态,经 getter 注入;
// PLANETS/kingSpawnPoint 直接来自 shared/planet-logic.mjs。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import { PLANETS, kingSpawnPoint } from '../shared/planet-logic.mjs';

let DEPS = null;

export function initNavButtons(deps) {
  DEPS = deps;
}

const NAV_CSS =
  'padding:12px 30px;border-radius:24px;border:1px solid rgba(255,214,130,.7);background:rgba(40,26,12,.8);color:#ffe9c4;font-size:16px;letter-spacing:4px;cursor:pointer;font-family:inherit';
function mkNavBtn(text) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = NAV_CSS + ';display:none;position:static;transform:none';
  return b;
}
const navA = mkNavBtn('');
const navB = mkNavBtn('');
const worldNav = document.createElement('div');
worldNav.id = 'worldNav';
worldNav.style.cssText =
  'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:' +
  Z.navBtn +
  ';display:none;flex-direction:column;gap:10px;align-items:center';
worldNav.appendChild(navA);
worldNav.appendChild(navB);
document.body.appendChild(worldNav);
// P1(2026-09-07 审计):transitioning 期间点击会静默失败——导航动作统一过此守卫:
// 切换中立即提示;动作被管理器拒绝(promise 解析 false)也提示,不再"按了没反应"
function navGuard(fn) {
  return function () {
    if (DEPS.getWorldManager().transitioning) {
      if (ctx.ui.modeToast)
        ctx.ui.modeToast(tt({ en: 'Travelling — one moment…', zh: '世界切换中，请稍候…' }));
      return;
    }
    const r = fn();
    if (r && typeof r.then === 'function')
      r.then(function (ok) {
        if (ok === false && ctx.ui.modeToast)
          ctx.ui.modeToast(
            tt({
              en: 'Can’t travel right now — try again in a moment',
              zh: '现在无法切换世界，稍后再试',
            })
          );
      });
  };
}
// 上下文导航:show=false 隐藏整组;aText/bText 为空则隐藏对应按钮
export function setNav(show, aText, aAction, bText, bAction) {
  if (!show) {
    worldNav.style.display = 'none';
    return;
  }
  navA.textContent = aText || '';
  navA.onclick = aAction ? navGuard(aAction) : null;
  navA.style.display = aText ? 'block' : 'none';
  navB.textContent = bText || '';
  navB.onclick = bAction ? navGuard(bAction) : null;
  navB.style.display = bText ? 'block' : 'none';
  worldNav.style.display = 'flex';
}
const goMainWorld = function () {
  // 回弹解除(gateArmed)与落点外推已随石门职责迁 gallery/portal.js(监听 world:changed)
  ctx.scene.toMainWorld();
};
// 进星球世界(2026-09-27 诚实指引:按编号进,只给已建成的站指路;调用方保证 num 对应 built 站)
const goPlanetNum = function (num) {
  const sp = kingSpawnPoint();
  DEPS.getWorldManager().enter('king' + num, {
    snapshot: {
      camera: null,
      player: {
        position: new THREE.Vector3(sp.x, sp.y, sp.z),
        yaw: sp.yaw,
        pitch: 0,
        vy: 0,
        onGround: true,
      },
    },
  });
};
// 国王星等回忆站:本站回忆未走完时不挂离开按钮(同 B612,避免新玩家误点中断剧情)
function kingMemoryOpen(world) {
  const idx = PLANETS.findIndex((p) => 'king' + p.num === world);
  return idx >= 0 && ctx.store.num('planetsChapter') <= idx;
}
const goB612Back = function () {
  DEPS.getWorldManager().back();
};

// 主循环里的导航决策(原 planets.js onTick 内联块,整块搬入;早退语义=函数 return 等价)
export function tickNav(activeWorld) {
  const chapter = DEPS.getChapter();
  const worldManager = DEPS.getWorldManager();
  const _wm = worldManager; // 原内联块同名局部,保形
  // 上下文导航(太空中常驻):B612=回主世界/去星球;星球=回 B612/回主世界
  // 诚实指引(2026-09-27):按钮只指向已建成的站 —— 325 完成后指"重返 325",
  // 不把玩家送进没内容的空岛;新站建成(built)后自动变"前往"
  if (activeWorld === 'b612') {
    // 小王子的家必须先走完，离别之后才前往 325。边界与物理仍正常更新。
    if (!ctx.store.flag('page1')) {
      // 回忆进行中不挂「返回沙漠」大按钮(2026-10-03 首访实测:它正好压在屏幕中央,
      // 新玩家被叫去火山时顺手点了它,整段回忆中断)。真要离开走菜单「离开这段回忆」。
      setNav(false);
      return; // 原 hud 死码行已随清理删除(2026-10-10)
    }
    const nextBuilt = PLANETS.find(function (p, i) {
      return i >= chapter && p.built;
    });
    const lastBuilt = PLANETS.filter(function (p) {
      return p.built;
    }).pop();
    const goTarget = nextBuilt || lastBuilt;
    let goLabel = nextBuilt
      ? tt({ zh: '前往 ', en: 'Visit ' }) +
        nextBuilt.num +
        ' ' +
        tt({ zh: nextBuilt.name, en: nextBuilt.en }) +
        ' →'
      : tt({ zh: '重返 ', en: 'Revisit ' }) +
        lastBuilt.num +
        ' ' +
        tt({ zh: lastBuilt.name, en: lastBuilt.en });
    let goFn = function () {
      goPlanetNum(goTarget.num);
    };
    // 星球都走完、地球那一天还没过(2026-10-04):下一步是「第八天 · 地球」旅途卡
    if (ctx.ui.voyage && ctx.ui.voyage.next() === 'earth') {
      goLabel = tt({ zh: '下一页 · 地球 →', en: 'Next page · the Earth →' });
      goFn = function () {
        ctx.ui.voyage.open('earth');
      };
    }
    setNav(true, tt({ zh: '返回沙漠', en: 'Back to the desert' }), goMainWorld, goLabel, goFn);
    ctx.ui.journey?.setPhase('travel-hub', {
      world: 'b612',
      chapter: { zh: '回忆旅途 · 下一站', en: 'Memory journey · next stop' },
      hint: {
        zh: '家的回忆已完成。点下方「' + goLabel + '」继续小王子的旅途。',
        en: 'Memories of home are complete. Use the button below to continue his journey.',
      },
      lock: chapter === 0,
    });
  } else if (
    /^king/.test(activeWorld) &&
    !kingMemoryOpen(activeWorld) &&
    ctx.ui.voyage &&
    ctx.ui.voyage.next() &&
    !ctx.ui.voyage.isOpen()
  ) {
    // 这颗星已走完、旅途还没到头(2026-10-04 衔接整改):主按钮 = 「下一夜 →」翻旅途卡直达下一站
    setNav(
      true,
      tt({ zh: '继续旅途 →', en: 'Travel on →' }),
      function () {
        ctx.ui.voyage.open();
      },
      tt({ zh: '← 返回 B612', en: '← Back to B612' }),
      goB612Back
    );
  } else if (/^king/.test(activeWorld) && !kingMemoryOpen(activeWorld)) {
    setNav(
      true,
      tt({ zh: '← 返回 B612', en: '← Back to B612' }),
      goB612Back,
      tt({ zh: '返回沙漠', en: 'Back to the desert' }),
      goMainWorld
    );
  } else setNav(false);
  return;
}

// HMR/卸载清理(planets.js 的 bag.custom 调用)
export function removeNav() {
  worldNav.remove();
}
