// guide-card.js — 《元素共鸣准则》初见指引卡(2026-09-18 自 main.js 外迁,结构审计 P3a)
// settings.js 在叫醒词收束 4s 后调用(ctx.ui.showGuideCard)。首访未取雅号才弹,10s 内「先逛逛」禁点。
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';

export function showGuideCard() {
  if (document.getElementById('guideCard')) return;
  if (
    !sessionStorage.getItem('agreementConsented') ||
    !sessionStorage.getItem('privacyConsented') ||
    !sessionStorage.getItem('communityConsented')
  )
    return;
  if (ctx.store.str('nick')) return;
  const c = document.createElement('div');
  c.id = 'guideCard';
  c.setAttribute('role', 'dialog');
  c.setAttribute('aria-modal', 'false');
  c.setAttribute('aria-label', '初见指引');
  c.style.cssText =
    'position:fixed;left:50%;top:64%;transform:translateX(-50%);z-index:' +
    Z.guideCard +
    ';background:rgba(30,18,28,0.95);border:1px solid rgba(255,214,170,0.35);border-radius:16px;padding:20px 26px;text-align:center;color:#ffe2c4';
  c.innerHTML =
    '<div style="font-size:15px;letter-spacing:2px;margin-bottom:10px">三千年来，第一个带着真意推开这扇门的，是你。<br>墙已经空了太久——挂上你的第一幅画吧。</div><div style="font-size:12px;letter-spacing:2px;margin-bottom:12px;opacity:.7">初见画廊,不妨先读《元素共鸣准则》</div>';
  const a = document.createElement('button');
  a.textContent = '读 一 读';
  a.setAttribute('aria-label', '阅读元素共鸣准则');
  a.style.cssText =
    'padding:9px 22px;border:none;border-radius:9px;background:linear-gradient(135deg,#c98a4b,#8a5a2a);color:#fff;cursor:pointer;margin-right:10px';
  a.onclick = () => {
    window.openPanel('guide.html', '元素共鸣准则');
    c.remove();
  };
  const b = document.createElement('button');
  b.textContent = '先逛逛';
  b.style.cssText =
    'padding:9px 22px;border:1px solid rgba(255,255,255,0.25);border-radius:9px;background:transparent;color:#dcc;cursor:pointer';
  b.onclick = () => {
    c.remove();
  };
  c.appendChild(a);
  c.appendChild(b);
  document.body.appendChild(c);
  let left = 10;
  b.disabled = true;
  b.style.opacity = '0.5';
  b.textContent = '先逛逛(' + left + 's)';
  const t = setInterval(function () {
    left--;
    if (left <= 0) {
      clearInterval(t);
      b.disabled = false;
      b.style.opacity = '';
      b.textContent = '先逛逛';
    } else b.textContent = '先逛逛(' + left + 's)';
  }, 1000);
}
