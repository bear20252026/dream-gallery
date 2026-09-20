// reveal.js — 纸色揭幕过渡(2026-09-06 主人定「从画走进现实」;2026-09-18 自 main.js 外迁,结构审计 P3a)
// 世界容器先垫纸色不透明打底(与电影最后一帧同色系),世界首帧渲染完成后纸幕淡出。
export function paperReveal() {
  const cWrap = document.getElementById('c');
  if (!cWrap) return;
  cWrap.style.background = '#f3ead2';
  cWrap.style.opacity = '0';
  cWrap.style.transition = 'opacity 1.6s ease';
  requestAnimationFrame(function () {
    cWrap.style.opacity = '1';
  });
  setTimeout(function () {
    cWrap.style.background = '';
    cWrap.style.transition = '';
    cWrap.style.opacity = '';
  }, 1800);
}
