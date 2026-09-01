// gallery-audio.js — 进画廊后的「音频轨」播放器(2026-09-01 主人定·串行交错版)
//
// 播放规则(2026-09-01 二次确认):
//   · 阶段2 序列由 video-wall.js 统一驱动(严格串行,同一时刻只播一个):
//       音1→屏1→音2→屏2→音3→屏3→屏4→屏5,整套跑 2 轮
//   · 第 3 轮起音频永久停止,仅视频轨(大屏1~5)无限循环
//   · 本模块只提供「播指定曲目并等播完」的能力,不再自行启动/循环
import { ctx } from '../../ctx.js';

const CDN = 'https://cdn.cloudbear.cloud/';

// 音频轨曲目(索引即播放顺序: 0=00010, 1=0009, 2=0008)
const AUDIO_TRACK = [CDN + 'music/00010.aac', CDN + 'music/0009.aac', CDN + 'music/0008.aac'];

let gAud = null; // 懒创建,整段序列共用同一个 Audio 元素(天然「最多一个音频」)

function getAud() {
  if (!gAud) {
    gAud = new Audio();
    gAud.volume = 0.5;
  }
  return gAud;
}

// 播放单首,返回 Promise 在该曲 ended 或超时(10s 起播失败)后 resolve
function playOne(url) {
  return new Promise(function (resolve) {
    const a = getAud();
    if (a._endedFn) {
      a.removeEventListener('ended', a._endedFn);
      a._endedFn = null;
    }
    if (a._pollId) {
      clearInterval(a._pollId);
      a._pollId = null;
    }
    a.pause();
    a.src = url;
    a.loop = false;
    let playing = false;
    const deadline = Date.now() + 10000;
    a._pollId = setInterval(function () {
      if (a.currentTime > 0.1) {
        playing = true;
        clearInterval(a._pollId);
        a._pollId = null;
      } else if (Date.now() > deadline && !playing) {
        clearInterval(a._pollId);
        a._pollId = null;
        console.warn('[gallery-audio] 超时跳过:', url);
        resolve();
      }
    }, 500);
    a._endedFn = function () {
      if (a._pollId) {
        clearInterval(a._pollId);
        a._pollId = null;
      }
      a.removeEventListener('ended', a._endedFn);
      a._endedFn = null;
      resolve();
    };
    a.addEventListener('ended', a._endedFn);
    a.play().catch(function (e) {
      console.warn('[gallery-audio] play():', e && e.name);
    });
  });
}

/**
 * 播放音频轨第 i 首(i: 0=00010, 1=0009, 2=0008),播完 resolve。
 * 由 video-wall.js 的串行序列调用;外部不自行启动。
 * @param {number} i - 曲目索引
 * @returns {Promise<void>}
 */
async function playGalleryAudio(i) {
  const url = AUDIO_TRACK[i];
  if (!url) return;
  await playOne(url);
}

// 导出:供 video-wall.js 串行序列调用
ctx.playGalleryAudio = playGalleryAudio;

export { playGalleryAudio };
