// agreement-music.js — 协议文档配乐(2026-07-31 建;2026-09-18 自 main.js 外迁,结构审计 P3a)
// 闸门 ENTER 手势回调链内起播(自动播放政策);世界落定即停。
import { avAllowed } from '../core/av-switch.js'; // 全站音视频总闸(2026-09-26)
const agreementMusic = new Audio('https://cdn.cloudbear.cloud/music/00001.m4a');
agreementMusic.loop = true;
agreementMusic.volume = 0.4;
let playing = false;

export function startAgreementMusic() {
  if (playing || !avAllowed()) return; // 总闸关闭:协议配乐静默
  playing = true;
  agreementMusic.play().catch(() => {});
}

export function stopAgreementMusic() {
  if (!playing) return;
  playing = false;
  agreementMusic.pause();
  agreementMusic.currentTime = 0;
}
