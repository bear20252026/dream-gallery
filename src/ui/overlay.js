// overlay.js — 弹层注册处·冷核心(2026-07-28 架构深化⑤,方案 B 配置全开放)
// 深模块:接口只有 register/anyOpen/isUiTouch 三个入口,实现藏里面——
//   注册即得弹层三铁律:✕(事件委托,内容重渲染也生效) + 点外圈 + Esc(栈式,后开先关);
//   el 自动打 data-overlay 标记,player.js 触摸白名单经 ctx.overlay.isUiTouch 识别,不再手抄 id 清单。
// 冷核心:本模块不接 HMR(与 ctx.js 同级);热模块注册后必须在 bag.custom 里 unregister。
// Esc 优先级:本模块在 main.js 最先 import,监听器最先注册——有弹层先关弹层并截停;
//   栈空时放行给后注册的消费者(ark 飞行 / player 画作放大 / settings 面板)。
// 生命周期:ctx.ui.overlay 服务在模块顶层注入(保证 Esc 监听最先注册,不被延迟到 System.init 破坏优先级);
//   关闭/销毁出口(closeAll/destroy)由 core/ui-system.js 在组合根 dispose 时调用,实现 ui 域生命周期收口。
import {ctx} from '../ctx.js';

const layers=new Map(); // el -> cfg
const stack=[];         // 打开顺序栈:后开先关

function isOpenEl(el){const d=el.style.display;return d==='flex'||d==='block';}
function removeFromStack(el){const i=stack.indexOf(el);if(i>=0)stack.splice(i,1);}

function closeLayer(cfg,reason){
  if(cfg.canClose&&!cfg.canClose(reason))return false; // 调用方可按原因拦截(如答题中禁点外圈)
  removeFromStack(cfg.el);
  cfg.el.style.display='none';
  if(cfg.onClose)cfg.onClose(reason);
  return true;
}
function openLayer(cfg){
  if(stack.includes(cfg.el))return;
  cfg.el.style.display=cfg.display;
  stack.push(cfg.el);
  if(cfg.onOpen)cfg.onOpen();
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
function register(el,opts){
  opts=opts||{};
  const cfg={
    el,
    display:opts.display||'flex',
    escapable:opts.escapable!==false,
    closeOnOutside:opts.closeOnOutside!==false,
    touchOnly:!!opts.touchOnly,
    canClose:opts.canClose||null,
    onOpen:opts.onOpen||null,
    onClose:opts.onClose||null,
    x:opts.x||null,
  };
  el.dataset.overlay='1'; // 触摸白名单统一识别标记
  if(cfg.closeOnOutside)el.addEventListener('click',e=>{if(e.target===el&&isOpenEl(el))closeLayer(cfg,'outside');});
  if(cfg.x)el.addEventListener('click',e=>{if(isOpenEl(el)&&e.target.closest&&e.target.closest(cfg.x)){e.stopPropagation();closeLayer(cfg,'x');}});
  layers.set(el,cfg);
  return {
    open(){if(!cfg.touchOnly)openLayer(cfg);},
    close(){if(!cfg.touchOnly)closeLayer(cfg,'api');},
    isOpen(){return !cfg.touchOnly&&isOpenEl(el);},
    unregister(){removeFromStack(el);layers.delete(el);delete el.dataset.overlay;},
  };
}

// Esc 统一栈(本模块最先 import,监听器最先触发;关到即止,下层弹层不吃同一个 Esc)
// onEsc 命名以便 UiSystem.dispose 能精确移除该全局监听(收口生命周期,避免泄漏)
function onEsc(e){
  if(e.key!=='Escape')return;
  for(let i=stack.length-1;i>=0;i--){
    const cfg=layers.get(stack[i]);
    if(cfg&&cfg.escapable&&closeLayer(cfg,'esc')){e.stopImmediatePropagation();return;}
  }
}
document.addEventListener('keydown',onEsc);

// 关闭全部已开弹层(保留 Esc 监听,供后续复用)——UiSystem.dispose 调用
function closeAll(){
  for(let i=stack.length-1;i>=0;i--)closeLayer(layers.get(stack[i]),'api');
  stack.length=0;
}
// 彻底销毁:关闭全部 + 移除全局 Esc 监听 + 清空注册表(应用卸载/HMR 收口用)
function destroyOverlay(){
  closeAll();
  layers.clear();
  document.removeEventListener('keydown',onEsc);
}

ctx.ui.overlay={
  register,
  anyOpen(){return stack.length>0;},
  isUiTouch(t){return !!(t&&t.closest&&t.closest('[data-overlay]'));},
  closeAll,
  destroy:destroyOverlay,
};
export { destroyOverlay, closeAll };
