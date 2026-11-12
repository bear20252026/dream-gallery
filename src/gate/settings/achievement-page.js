// achievement-page.js — 罗盘「成就」页(C4,2026-11-12 新功能)
// 设计依据:ROADMAP 第五节修正「成就系统=10 项」(六灵蕴 6 + 六合归位 + 天空的访客 + 云端的归宿 + 补天者)。
//
// 分工:判定全在 shared/achievements.mjs(纯核,26 项单测钉死);本文件只做三件事——
//   ① 读既有进度折成快照 → ② 渲染 10 个徽章位(未达成显示锁定位,不隐藏) → ③ 新解锁走 modeToast 通报。
// 铁律遵循:
//   · 弹层走 ctx.overlay.register(自动 data-overlay 标记 + ✕/Esc/点外圈三退出,不手抄白名单);
//   · 存档只经 ctx.store(achievementsSeen 已登记 SCHEMA),不直写 localStorage;
//   · 徽章名/描述来自定义表常量,textContent 注入(不拼 innerHTML),无 XSS 面;
//   · 双语随 scriptLang() 切换(与全站一致,英文站显示英文名与描述)。
import { Z } from '../../shared/z-layers.mjs';
import { ctx } from '../../ctx.js';
import { scriptLang } from '../../shared/story-text.mjs';
import { ACHIEVEMENTS, achievementView, newlyEarned } from '../../shared/achievements.mjs';

const ov = document.createElement('div');
ov.id = 'achOv';
ov.style.cssText =
  'position:fixed;inset:0;z-index:' +
  Z.modal +
  ';display:none;align-items:center;justify-content:center;background:rgba(12,6,12,0.62);font-family:inherit';
ov.innerHTML =
  '<div style="width:min(420px,92vw);max-height:84vh;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(38,22,34,0.98),rgba(24,14,26,0.98));border:1px solid rgba(255,214,170,.3);border-radius:18px;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55)">' +
  '<div style="display:flex;align-items:center;margin-bottom:4px"><b style="letter-spacing:2px;font-size:15px" id="achTitle">成就</b>' +
  '<span id="achCount" style="font-size:11px;color:rgba(255,217,168,.6);margin-left:8px"></span>' +
  '<span id="achX" style="margin-left:auto;cursor:pointer;color:rgba(255,255,255,.55);padding:2px 8px;font-size:14px">✕</span></div>' +
  '<div id="achSub" style="font-size:11px;color:rgba(255,255,255,.42);line-height:1.7;margin-bottom:10px"></div>' +
  '<div id="achList" style="overflow-y:auto;display:flex;flex-direction:column;gap:7px;padding-right:2px"></div></div>';
document.body.appendChild(ov);
export const achApi = ctx.overlay.register(ov, { x: '#achX' });

/** 把既有进度折成纯核要的快照(只读,不新增进度来源) */
function snapshot() {
  return {
    spiritsKeys: ctx.store.getSpirits(),
    spiritsDone: ctx.store.flag('spiritsDone'),
    arkFlew: ctx.store.flag('arkFlew'),
    eternalPicks: ctx.store.json('eternalPicks', []),
    skyMs: ctx.store.num('skyMs'),
  };
}

// 徽章位:结构建一次,之后只改类名与文字(避免每次开页重建 DOM)
const rows = new Map();
function buildRows() {
  const list = document.getElementById('achList');
  list.textContent = '';
  for (const def of ACHIEVEMENTS) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid rgba(255,255,255,.12);border-radius:10px;transition:background .25s,border-color .25s';
    const dot = document.createElement('span');
    dot.style.cssText =
      'flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;border:1px solid rgba(255,255,255,.2)';
    const box = document.createElement('div');
    box.style.cssText = 'flex:1;min-width:0';
    const nm = document.createElement('div');
    nm.style.cssText = 'font-size:13px;letter-spacing:1px';
    const ds = document.createElement('div');
    ds.style.cssText = 'font-size:11px;opacity:.55;margin-top:2px;line-height:1.5';
    box.appendChild(nm);
    box.appendChild(ds);
    row.appendChild(dot);
    row.appendChild(box);
    list.appendChild(row);
    rows.set(def.id, { row, dot, nm, ds });
  }
}
buildRows();

function render() {
  const en = scriptLang() === 'en';
  document.getElementById('achTitle').textContent = en ? 'Achievements' : '成就';
  document.getElementById('achSub').textContent = en
    ? 'Every star you gathered is remembered here. Locked ones are simply waiting.'
    : '你拾起的每一片星屑，都被记在这里。未点亮的，只是在等。';
  const view = achievementView(snapshot());
  const got = view.filter((v) => v.earned).length;
  document.getElementById('achCount').textContent = got + ' / ' + view.length;
  for (const { def, earned } of view) {
    const r = rows.get(def.id);
    if (!r) continue;
    r.nm.textContent = en ? def.en : def.name;
    r.ds.textContent = en ? def.descEn : def.desc;
    if (earned) {
      r.row.style.background = 'rgba(200,138,75,.16)';
      r.row.style.borderColor = 'rgba(255,214,170,.5)';
      r.dot.style.background = def.color;
      r.dot.style.borderColor = def.color;
      r.dot.style.color = '#2c2014';
      r.dot.textContent = '✦';
      r.nm.style.color = '#ffe2c4';
    } else {
      r.row.style.background = 'rgba(255,255,255,.03)';
      r.row.style.borderColor = 'rgba(255,255,255,.1)';
      r.dot.style.background = 'transparent';
      r.dot.style.borderColor = 'rgba(255,255,255,.18)';
      r.dot.style.color = 'rgba(255,255,255,.3)';
      r.dot.textContent = '·';
      r.nm.style.color = 'rgba(255,255,255,.5)';
    }
  }
}

/**
 * 新解锁通报:每次进度可能变化时调(装配层在灵蕴拾取/首飞/选片/天穹里程碑后调,也可开页时兜底调)。
 * 只通报"本次新达成且没通报过"的,通报后记进 achievementsSeen;多条合并成一句,不刷屏。
 * @returns {string[]} 本次通报的徽章 id
 */
export function announceAchievements() {
  const raw = snapshot();
  const seen = ctx.store.json('achievementsSeen', []);
  const fresh = newlyEarned(raw, seen);
  if (!fresh.length) return [];
  const en = scriptLang() === 'en';
  const names = fresh.map((id) => {
    const d = ACHIEVEMENTS.find((a) => a.id === id);
    return d ? (en ? d.en : d.name) : id;
  });
  const msg = en
    ? '✦ Achievement unlocked: ' + names.join(' · ')
    : '✦ 成就点亮：' + names.join(' · ');
  ctx.ui.modeToast && ctx.ui.modeToast(msg, 3200);
  // 记录已通报(合并既有,去重);写失败由 store 自兜底,不影响达成判定(达成永远实时算)
  const merged = [...new Set([...(Array.isArray(seen) ? seen : []), ...fresh])];
  ctx.store.setJson('achievementsSeen', merged);
  return fresh;
}

export function openAchievements() {
  announceAchievements(); // 开页兜底:即便装配层漏调,玩家也能在此看到通报
  render();
  achApi.open();
}

// 语言切换即时重绘(与全站 script:lang 事件同口径;弹层常驻,故随事件更新)
function onLang() {
  if (achApi.isOpen()) render();
}
window.addEventListener('script:lang', onLang);

// HMR 卸载:监听与 DOM 成对摘除(2026-11-11 审计 P3-8 立的口径——window 监听不许只挂不摘,
// 否则每次热更都在 window 上留一个永久监听;弹层注册也一并 unregister 精确卸监听)。
if (import.meta.hot) {
  import.meta.hot.dispose(function () {
    try {
      window.removeEventListener('script:lang', onLang);
    } catch (e) {
      console.warn('[achievements] 摘语言监听失败:', e && e.message);
    }
    try {
      achApi.unregister();
    } catch (e) {
      console.warn('[achievements] 弹层卸载失败:', e && e.message);
    }
    try {
      ov.remove();
    } catch (e) {
      console.warn('[achievements] 移除弹层 DOM 失败:', e && e.message);
    }
  });
  import.meta.hot.accept();
}
