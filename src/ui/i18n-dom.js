// ui/i18n-dom.js — 界面文字跟随语言(2026-10-03 主人定:英文为默认,中文是可切换的备选)
// 剧情台词早已走 tt();这里管的是界面上的固定文字/属性(按钮、提示、aria-label、title):
// 绑定一次,切换语言(script:lang)时自动换。index.html 里的静态节点也在这里一次绑上。
import { tt, scriptLang } from '../shared/story-text.mjs';

const bound = new Map(); // el -> { text?: entry, attrs: {name: entry} }

function apply(el, b) {
  if (b.text) el.textContent = tt(b.text);
  for (const [name, entry] of Object.entries(b.attrs)) el.setAttribute(name, tt(entry));
}

/** 把元素文字绑定到 {en, zh};返回元素本身 */
export function i18nText(el, entry) {
  if (!el) return el;
  const b = bound.get(el) || { attrs: {} };
  b.text = entry;
  bound.set(el, b);
  apply(el, b);
  return el;
}

/** 把元素属性(title / aria-label / placeholder…)绑定到 {en, zh} */
export function i18nAttr(el, name, entry) {
  if (!el) return el;
  const b = bound.get(el) || { attrs: {} };
  b.attrs[name] = entry;
  bound.set(el, b);
  apply(el, b);
  return el;
}

function refreshAll() {
  document.documentElement.lang = scriptLang() === 'zh' ? 'zh-CN' : 'en';
  for (const [el, b] of bound) {
    if (!el.isConnected) {
      bound.delete(el);
      continue;
    }
    apply(el, b);
  }
}

/** index.html 里的固定节点(开机一次;模块自己建的节点由各模块调用 i18nText/i18nAttr) */
export function bindStaticDom() {
  if (typeof document === 'undefined') return;
  const $ = (sel) => document.querySelector(sel);
  i18nText($('.skip-link'), { en: 'Skip to the game', zh: '跳到画廊' });
  i18nAttr($('.skip-link'), 'aria-label', {
    en: 'Skip navigation and go to the game',
    zh: '跳过导航，直接进入画廊',
  });
  i18nAttr($('#panelOv'), 'aria-label', { en: 'Embedded panel', zh: '内嵌面板' });
  i18nText($('#panelClose'), { en: '✕ Back to the game', zh: '✕ 返回画廊' });
  i18nAttr($('#panelClose'), 'aria-label', {
    en: 'Close the panel and return to the game',
    zh: '关闭面板，返回画廊',
  });
  i18nAttr($('#panelFrame'), 'title', { en: 'Panel content', zh: '面板内容' });
  i18nAttr($('#c'), 'aria-label', { en: 'B612 3D scene', zh: 'B612 3D 场景' });
  i18nAttr($('#m'), 'aria-label', { en: 'Minimap', zh: '小地图' });
  i18nText($('#ab'), { en: 'Play music', zh: '开启音乐' });
  i18nAttr($('#ab'), 'aria-label', { en: 'Play music', zh: '开启音乐' });
  i18nText($('#aiPanel .aiTag'), { en: 'B612 · memory echo', zh: 'B612 记忆回声' });
  refreshAll();
  window.addEventListener('script:lang', refreshAll);
}
