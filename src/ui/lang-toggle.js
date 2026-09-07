// lang-toggle.js — 剧情语言切换钮(2026-09-07 主人定:双语可切换,非上下堆叠)
// 用法:makeLangToggle() 返回一个自更新标签的按钮(点按翻转 en/zh 并广播 'script:lang');
//       闸门/电影 HUD 各挂一个实例。语言存档走 ctx.store 的 lang 键(SCHEMA 已登记)。
import { ctx } from '../ctx.js';
import { scriptLang, setScriptLang } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';

export function toggleLang() {
  const next = scriptLang() === 'en' ? 'zh' : 'en';
  try {
    ctx.store.setStr('lang', next);
  } catch (e) {}
  setScriptLang(next);
  document.body.dataset.scriptLang = next;
  window.dispatchEvent(new CustomEvent('script:lang', { detail: { lang: next } }));
  return next;
}
export function applySavedLang() {
  try {
    setScriptLang(ctx.store.str('lang', 'en') || 'en');
  } catch (e) {
    setScriptLang('en');
  }
  return scriptLang();
}
export function currentLang() {
  return scriptLang();
}

// 生成一个语言切换按钮元(自更新标签)。opts.labelPos: 显示当前语言("EN"/"中").
export function makeLangToggle(opts) {
  opts = opts || {};
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', '切换语言 / toggle language');
  btn.textContent = scriptLang() === 'en' ? 'EN' : '中文';
  btn.style.cssText =
    'position:absolute;' +
    (opts.placement || 'top:14px;right:14px') +
    ';padding:5px 14px;border:1px solid rgba(120,90,50,.5);border-radius:20px;' +
    'background:rgba(40,32,20,.72);color:#ffe9c4;font-size:12px;letter-spacing:2px;z-index:' +
    (opts.z || Z.navBtn) +
    ';cursor:pointer;font-family:inherit';
  const updateLabel = function () {
    btn.textContent = scriptLang() === 'en' ? 'EN' : '中文';
  };
  btn.onclick = function () {
    toggleLang();
    updateLabel();
  };
  window.addEventListener('script:lang', updateLabel);
  return btn;
}