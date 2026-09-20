// bigscreen-boot.js — 大屏轮播延迟启动(2026-09-18 自 main.js finishIntro 外迁;结构审计 P3a)
// 刻意保持零重依赖:引导阶段即可静态 import(两段式开机铁律——引导期禁拖世界模块)。
// 轮询等待 video-wall.js(世界阶段)挂出 ctx.media.startVidSeq,最多 60s。
import { ctx } from '../ctx.js';

export function startBigscreenWhenReady(deferMedia) {
  let started = false;
  const tryStart = function () {
    if (started) return true;
    if (!ctx.media.startVidSeq) return false;
    started = true;
    ctx.media.startVidSeq();
    return true;
  };
  const armPoll = function () {
    const poll = setInterval(function () {
      if (tryStart()) clearInterval(poll);
    }, 300);
    setTimeout(function () {
      clearInterval(poll);
      if (!started) console.warn('[bigscreen] startVidSeq 60s 未就绪,大屏轮播本轮放弃');
    }, 60000);
  };
  if (deferMedia) {
    let armed = false;
    const arm = function () {
      if (armed) return;
      armed = true;
      armPoll();
    };
    document.addEventListener('click', arm, { once: true });
    document.addEventListener('touchstart', arm, { once: true });
    setTimeout(arm, 4000);
  } else {
    armPoll();
  }
}
