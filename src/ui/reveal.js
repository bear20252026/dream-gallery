// reveal.js — 揭幕过渡(2026-09-06 主人定「从画走进现实」;2026-09-18 自 main.js 外迁,结构审计 P3a)
// 2026-09-24 消闪改暗起:开场电影结尾是「沉入全黑」(openfilm fDark #0d0b09),原纸色亮底
// 会在世界首帧卡顿(着色器编译)时形成 黑→亮纸→地图 的亮闪(主人报「ENTER 后闪一下」)。
// 现在与电影黑场同色起步:黑场→世界淡入 = 睡醒睁眼,主线程卡顿期间画面恒暗,无亮闪。
export function paperReveal() {
  const cWrap = document.getElementById('c');
  if (!cWrap) return;
  cWrap.style.background = '#0d0b09';
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
