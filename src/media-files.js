// ===================== 媒体列表共享数据管道(2026-11-17 B7) =====================
// 病:晨光留影(eternal.js)与新媒体墙(paintings.js)各自每 45s 轮询同一 /api/files,
//     两份定时器、两份 SSE 订阅、两套隐藏暂停逻辑,重复拉取同一接口。
// 治:单一管道——一个 45s 定时器 + 一个 onMediaChanged 订阅 + 一处隐藏暂停,
//     拉一次 /api/files(全量,条目带 name/url/mtime),分发给所有订阅方。
//     订阅方各自从同一份数据取所需(晨光用 name+mtime,新媒体墙用 url),互不干扰。
//
// 纪律:
//  - 仿 media-push.js 单例模式:首个订阅启动定时器+SSE,末个退订停掉,不空转。
//  - 隐藏暂停:document.hidden 时停定时器(省后台空拉),回前台立即拉一次再重启。
//  - 失败不抛:订阅方回调各自 try/catch;管道只 warn 留痕,下轮重试。
//  - 订阅即喂缓存:新订阅方立即拿到最近一次成功数据(若有),不必等下一轮。
import { onMediaChanged } from './media-push.js';

const POLL_MS = 45000;
const listeners = new Set();
const errListeners = new Set();
let timer = null;
let offMedia = null;
let lastData = null; // 最近一次成功的 /api/files 全量响应
let fetching = false; // 防并发重入(SSE 与定时器可能同时触发)

/**
 * 订阅媒体列表刷新。每次成功拉取(或 SSE 推送触发的拉取)后以全量数据回调。
 * @param {(data:{photos?:Array,videos?:Array,music?:Array})=>void} cb
 * @param {()=>void} [onError] 拉取失败回调(保真原 fallback:如 paintings 首次失败仍挂静态画)
 * @returns {()=>boolean} 退订函数;teardown 时调用,摘掉回调,末个退订停管道
 */
export function onMediaFiles(cb, onError) {
  const entry = { cb, onError };
  listeners.add(entry);
  ensure();
  // 订阅即喂缓存:新订阅方立即拿到最近数据,不必等 45s
  if (lastData) {
    try {
      cb(lastData);
    } catch (e) {
      /* 订阅方自身错误不影响管道 */
    }
  }
  return () => {
    const removed = listeners.delete(entry);
    if (listeners.size === 0) stop();
    return removed;
  };
}

/** 立即拉一次并分发(SSE 推送 / 回前台 / 手动刷新共用) */
export function refreshMediaFiles() {
  if (fetching) return; // 防重入
  fetching = true;
  fetch('/api/files', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      lastData = d;
      for (const entry of listeners) {
        try {
          entry.cb(d);
        } catch (e) {
          /* 单个订阅方失败不拖累其他 */
        }
      }
    })
    .catch((e) => {
      console.warn('[media-files] 列表拉取失败,待下轮重试', e);
      // 保真原 fallback:通知订阅方失败(如 paintings 首次失败仍挂静态画、eternal 补演示照片)
      for (const entry of listeners) {
        if (entry.onError) {
          try {
            entry.onError();
          } catch (err) {
            /* 订阅方自身错误不影响管道 */
          }
        }
      }
    })
    .finally(() => {
      fetching = false;
    });
}

function ensure() {
  if (timer || offMedia) return; // 已在跑
  // SSE 推送:后台增删 → 立即拉一次(不等轮询);photos/videos/music 都关心
  // (2026-11-17 收编 audio-manager 第三套轮询:music 目录变更也触发,全量响应本就含 music)
  offMedia = onMediaChanged((d) => {
    if (!d || d.dir === 'photos' || d.dir === 'videos' || d.dir === 'music') refreshMediaFiles();
  });
  startTimer();
  // 隐藏暂停:后台标签页不空拉;回前台立即补一次
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }
  refreshMediaFiles(); // 启动即拉一次
}

function startTimer() {
  if (timer) return;
  timer = setInterval(refreshMediaFiles, POLL_MS);
}

function onVisibility() {
  if (document.hidden) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  } else {
    refreshMediaFiles();
    startTimer();
  }
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (offMedia) {
    offMedia();
    offMedia = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
  }
}
