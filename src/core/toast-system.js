// core/toast-system.js — 示范积木:把全站 modeToast 改为事件驱动(阶段1,2026-08-27)
// 订阅 eventBus 'ui:toast' 事件并渲染 #modeToast。
// 旧的全站 ctx.ui.modeToast(...) 调用经 mode.js 的防腐转发层 emit 此事件,调用方零改动。
// 这是"event-bus 第一次被业务消费"的落地验证,证明 ctx 总线外的事件通信链路真实可用。
import { eventBus } from './event-bus.js';

export function createToastSystem() {
  let el = null;
  let timer = null;

  function render(msg, duration = 2200) {
    if (!el) {
      el = document.getElementById('modeToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'modeToast';
        el.style.cssText =
          'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:rgba(30,16,26,0.92);color:#ffd9e4;padding:10px 22px;border-radius:12px;font-size:14px;z-index:60;pointer-events:none;border:1px solid rgba(255,182,200,0.3);transition:opacity .3s';
        document.body.appendChild(el);
      }
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.style.opacity = '0';
    }, duration);
  }

  let off = null;
  return {
    name: 'toast',
    layer: 'presentation',
    phase: 'ui',
    order: 0,
    init() {
      off = eventBus.on('ui:toast', ({ text, duration }) => render(text, duration));
    },
    dispose() {
      if (off) off();
      off = null;
      if (timer) clearTimeout(timer);
    },
  };
}
