// overlay.js — 弹层注册处·冷核心(2026-07-28 架构深化⑤,方案 B 配置全开放)
// 深模块:接口只有 register/anyOpen/isUiTouch 三个入口,实现藏里面——
//   注册即得弹层三铁律:✕(事件委托,内容重渲染也生效) + 点外圈 + Esc(栈式,后开先关);
//   el 自动打 data-overlay 标记,player.js 触摸白名单经 ctx.overlay.isUiTouch 识别,不再手抄 id 清单。
// 冷核心:本模块不接 HMR(与 ctx.js 同级);热模块注册后必须在 bag.custom 里 unregister。
// Esc 优先级:本模块在 main.js 最先 import,监听器最先注册——有弹层先关弹层并截停;
//   栈空时放行给后注册的消费者(ark 飞行 / player 画作放大 / settings 面板)。
// 生命周期:ctx.ui.overlay 服务在模块顶层注入(保证 Esc 监听最先注册,不被延迟到 System.init 破坏优先级);
//   关闭/销毁出口(closeAll/destroy)由 core/ui-system.js 在组合根 dispose 时调用,实现 ui 域生命周期收口。
import { ctx } from '../ctx.js';

const layers = new Map(); // el -> cfg
const stack = []; // 打开顺序栈:后开先关

function isOpenEl(el) {
  const d = el.style.display;
  return d === 'flex' || d === 'block';
}
function removeFromStack(el) {
  const i = stack.indexOf(el);
  if (i >= 0) stack.splice(i, 1);
}

function closeLayer(cfg, reason) {
  if (cfg.canClose && !cfg.canClose(reason)) return false; // 调用方可按原因拦截(如答题中禁点外圈)
  removeFromStack(cfg.el);
  cfg.el.style.display = 'none';
  if (cfg.onClose) cfg.onClose(reason);
  return true;
}
function openLayer(cfg) {
  if (stack.includes(cfg.el)) return;
  ensureOverlayListeners(); // 打开即确保在挂(register 之外的第二条路;destroy 后重新 open 也能启回来)
  cfg.el.style.display = cfg.display;
  stack.push(cfg.el);
  if (cfg.onOpen) cfg.onOpen();
}

// register(el, opts) → {open, close, isOpen, unregister}
// opts(全可选,默认即三铁律):
//   display='flex'      打开时的 display 值
//   escapable=true      Esc 可关
//   closeOnOutside=true 点外圈可关
//   x=null              ✕ 选择器(如 '#chatX';事件委托,innerHTML 重渲染后仍生效)
//   canClose(reason)    返回 false 拦截关闭;reason: 'esc'|'outside'|'x'|'api'
//   onOpen()/onClose(reason)  副作用钩子(如聊天室开关轮询定时器)
//   touchOnly=false     true=只进触摸白名单,不管开关节奏(飞舟 HUD/序章/一次性弹窗用)
function register(el, opts) {
  opts = opts || {};
  const cfg = {
    el,
    display: opts.display || 'flex',
    escapable: opts.escapable !== false,
    closeOnOutside: opts.closeOnOutside !== false,
    touchOnly: !!opts.touchOnly,
    canClose: opts.canClose || null,
    onOpen: opts.onOpen || null,
    onClose: opts.onClose || null,
    x: opts.x || null,
    off: [], // 本注册挂在元素上的监听卸除口(2026-10-11 unregister 精确摘除)
  };
  el.dataset.overlay = '1'; // 触摸白名单统一识别标记
  // 2026-10-03 测试反馈修复:touchOnly 层(任务卡/飞行控件/HUD)不归本模块管开关,绝不能被「点外圈」关掉。
  // 此前点到任务卡空白处(e.target===el)会把卡片 display:none,而任务仍在进行 → 火山选择按钮消失,剧情卡死。
  if (cfg.closeOnOutside && !cfg.touchOnly) {
    const onOutside = (e) => {
      if (e.target === el && isOpenEl(el)) closeLayer(cfg, 'outside');
    };
    el.addEventListener('click', onOutside);
    cfg.off.push(() => el.removeEventListener('click', onOutside));
  }
  if (cfg.x) {
    const onX = (e) => {
      if (isOpenEl(el) && e.target.closest && e.target.closest(cfg.x)) {
        e.stopPropagation();
        closeLayer(cfg, 'x');
      }
    };
    el.addEventListener('click', onX);
    cfg.off.push(() => el.removeEventListener('click', onX));
  }
  layers.set(el, cfg);
  ensureOverlayListeners(); // 惰性挂载(引用计数>0 就一定在挂;见下方 sync 说明)
  return {
    open() {
      if (!cfg.touchOnly) openLayer(cfg);
    },
    close() {
      if (!cfg.touchOnly) closeLayer(cfg, 'api');
    },
    isOpen() {
      return !cfg.touchOnly && isOpenEl(el);
    },
    unregister() {
      for (const f of cfg.off) {
        try {
          f();
        } catch (e) {
          console.warn('[overlay] unregister 卸监听失败:', e.message);
        }
      }
      cfg.off.length = 0;
      removeFromStack(el);
      layers.delete(el);
      delete el.dataset.overlay;
      releaseOverlayListeners(); // 注册表空了就摘全局监听(dispose→init 可逆的关键一半)
    },
  };
}

// Esc 统一栈(本模块最先 import,监听器最先触发;关到即止,下层弹层不吃同一个 Esc)
// onEsc 命名以便精确移除(收口生命周期,避免泄漏)。
function onEsc(e) {
  if (e.key !== 'Escape') return;
  for (let i = stack.length - 1; i >= 0; i--) {
    const cfg = layers.get(stack[i]);
    if (cfg && cfg.escapable && closeLayer(cfg, 'esc')) {
      e.stopImmediatePropagation();
      return;
    }
  }
}

// 全局 Esc 监听的挂卸(2026-10-11 可重装配整改)——旧写法是模块顶层一次性 addEventListener:
// ES Module 顶层代码不会重跑,一旦 destroyOverlay() 摘掉它,Esc **永久失效**(dispose 掉就再也启不来)。
// 现改成「常驻持有 + 引用计数」两个来源任一非零就在挂:
//   eagerHold  模块顶层的常驻持有(开机即挂,与旧写法逐字等价 → main.js 最先 import 抢在
//              ark/player/settings 之前注册,Esc 优先级「有弹层先关弹层,栈空才轮到它们」不变)
//   layers.size 还有注册表就必须在挂(unregister 归零时摘)
// destroyOverlay() 放开常驻持有并清空注册表 → 监听真的卸下;此后任何 register/open 会重新挂上,
// 于是 dispose→init 双向可逆(HMR/二次装配不再需要整页刷新)。
let escBound = false;
let eagerHold = true;
function syncOverlayListeners() {
  const shouldBind = eagerHold || layers.size > 0;
  if (shouldBind && !escBound) {
    document.addEventListener('keydown', onEsc);
    escBound = true;
  } else if (!shouldBind && escBound) {
    document.removeEventListener('keydown', onEsc);
    escBound = false;
  }
}
/** 挂上全局 Esc 监听(幂等)。register/open 内部会自动调,外部一般不需要。 */
export function ensureOverlayListeners() {
  syncOverlayListeners();
}
/** 放开一路持有:引用计数(注册表)归零且无常驻持有时才真的摘掉监听。 */
export function releaseOverlayListeners() {
  syncOverlayListeners();
}
syncOverlayListeners(); // 顶层常驻挂载:与旧的一次性 addEventListener 等价,保住 Esc 优先级顺序

// 关闭全部已开弹层(保留注册表与 Esc 监听,供后续复用)——UiSystem.dispose 调用
function closeAll() {
  for (let i = stack.length - 1; i >= 0; i--) closeLayer(layers.get(stack[i]), 'api');
  stack.length = 0;
}
// 彻底销毁:关闭全部 + 清空注册表 + 放开常驻持有并移除全局 Esc 监听(应用卸载/HMR 收口用)
// 销毁后再次 register/open 会经 ensureOverlayListeners() 把监听挂回来(dispose→init 可逆)。
function destroyOverlay() {
  closeAll();
  layers.clear();
  eagerHold = false;
  syncOverlayListeners();
}

ctx.ui.overlay = {
  register,
  anyOpen() {
    return stack.length > 0;
  },
  isUiTouch(t) {
    return !!(t && t.closest && t.closest('[data-overlay]'));
  },
  closeAll,
  destroy: destroyOverlay,
};
export { destroyOverlay, closeAll };
