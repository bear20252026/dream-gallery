// agreement-music.js — 协议文档配乐(2026-07-31 建;2026-09-18 自 main.js 外迁,结构审计 P3a)
// 闸门 ENTER 手势回调链内起播(自动播放政策);世界落定即停。
// ⚠️ 2026-10-12:Audio 改为**惰性创建**。原来顶层 `new Audio('https://cdn…/00001.m4a')` 在本模块被
//   main.js 顶层 import 的那一刻就发起下载,而"协议配乐"早在 2026-10-03 已被剧情音乐取代——
//   全仓除本文件的定义外**没有任何** `startAgreementMusic()` 调用点(grep 实测),于是每次首访都
//   白下 1.6MB 再被浏览器 abort(CDP 量线上:该 URL 两次入网共 1674KB,其中 1638KB 是这轮 abort 的
//   完整下载;debug-browser 的 `REQ_FAIL … ERR_ABORTED` 就是它)。现在只有真起播才建元素。
import { avAllowed } from '../core/av-switch.js'; // 全站音视频总闸(2026-09-26)
const AGREEMENT_MUSIC_URL = 'https://cdn.cloudbear.cloud/music/00001.m4a';
/** @type {HTMLAudioElement|null} */
let agreementMusic = null; // 惰性:没人起播就一个字节都不下
let playing = false;

export function startAgreementMusic() {
  if (playing || !avAllowed()) return; // 总闸关闭:协议配乐静默
  if (!agreementMusic) {
    agreementMusic = new Audio(AGREEMENT_MUSIC_URL);
    agreementMusic.loop = true;
    agreementMusic.volume = 0.4;
  }
  playing = true;
  agreementMusic.play().catch(() => {});
}

export function stopAgreementMusic() {
  if (!playing) return;
  playing = false;
  if (!agreementMusic) return; // 从未起播过 ⇒ 没有元素可停
  agreementMusic.pause();
  agreementMusic.currentTime = 0;
}
