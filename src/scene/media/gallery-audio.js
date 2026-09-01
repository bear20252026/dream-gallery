// gallery-audio.js — 进画廊后的「音频轨」(2026-09-01 主人定)
//
// 播放规则(与视频墙 video-wall.js 的「视频轨」并行,共同构成进入画廊后的媒体序列):
//   · 阶段1(三连读规则页): 00001.m4a 循环 —— 由 main.js 的 agreementMusic 负责
//   · 阶段2(画廊场景实际加载完成后):
//       音频轨 00010.aac → 0009.aac → 0008.aac,整套循环 2 轮,第 3 轮起永久停止
//   互斥: 单 Audio 元素串行播放,天然满足「两个音频不能同时播」
//
// 触发: 画廊场景加载完成(gallery:ready 事件)即启动;video-wall.js 的
//   triggerSequence 也会显式调用 ctx.startGalleryAudio(在用户手势链内,利于自动播放)。
import { ctx } from '../../ctx.js';

const CDN = 'https://cdn.cloudbear.cloud/';

// 音频轨曲目(顺序即播放顺序)
const AUDIO_TRACK = [CDN + 'music/00010.aac', CDN + 'music/0009.aac', CDN + 'music/0008.aac'];

// 整套循环轮数;跑完即永久停止(第 3 轮起不播)
const ROUNDS = 2;

let gAud = null; // 懒创建,整段序列共用同一个 Audio 元素
let started = false; // 已开始,防止 gallery:ready + startVidSeq 重复触发
let finished = false; // 2 轮跑完,标记永久停止

function getAud() {
  if (!gAud) {
    gAud = new Audio();
    gAud.volume = 0.5;
  }
  return gAud;
}

// 阶段1的协议配乐应在此刻停掉(防御性,prologue.js 也会在进馆时调一次)
function stopAgreementDefensive() {
  try {
    if (typeof ctx.stopAgreementMusic === 'function') ctx.stopAgreementMusic();
  } catch (e) {}
}

// 「最多1个音频」: 进画廊序列启动时,若背景音乐正在播则暂停(不自动恢复,留待用户手动)
function pauseBackgroundMusic() {
  try {
    const mA = ctx.media && ctx.media.mA;
    if (mA && !mA.paused) mA.pause();
  } catch (e) {}
}

// 播放单首,返回 Promise 在该曲 ended 或超时(10s)后 resolve
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

async function runSequence() {
  for (let r = 0; r < ROUNDS; r++) {
    if (finished) return;
    for (const url of AUDIO_TRACK) {
      if (finished) return;
      await playOne(url);
    }
  }
  // 2 轮跑完,永久停止(第 3 轮起不再启动)
  finished = true;
  console.log('[gallery-audio] 2 轮播放完毕,已停止(此后仅视频轨继续)');
}

function startGalleryAudio() {
  if (started) return;
  started = true;
  if (finished) return; // 已跑完则不再重启
  stopAgreementDefensive();
  pauseBackgroundMusic();
  runSequence().catch(function () {});
}

// 导出:供 video-wall.js 在用户手势链内显式调用
ctx.startGalleryAudio = startGalleryAudio;
// 兜底:画廊场景加载完成事件也启动(防 startVidSeq 漏调)
ctx.events.on('gallery:ready', function () {
  startGalleryAudio();
});

export { startGalleryAudio };
