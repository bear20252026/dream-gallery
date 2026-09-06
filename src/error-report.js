// error-report.js — 客户端报错反馈采集
// 2026-08-30 主人要求:"把报错反馈安进游戏里,报错直接在后台展现,覆盖各个方面"
//
// 采集范围(五类,对应后台 tab 的类型筛选):
//   1. js        window.onerror —— 未捕获的运行时异常
//   2. promise   unhandledrejection —— 未处理的 Promise 拒绝
//   3. resource  资源加载失败(img/script/link/audio/video/source)
//   4. webgl     WebGL context lost(黑屏/冻结的常见原因)
//   5. network   fetch 失败(后端不可达、超时)
//
// 设计要点:
//   - 缓冲 + 节流:同类错误在窗口内合并,最多每 FLUSH_MS 发一次,避免刷屏拖垮页面

import { expose } from './debug-hooks.js';
//   - 尽力而为:上报本身绝不再抛错、不阻塞游戏(全部 try/catch 包裹)
//   - 去重视后的计数在服务端完成,这里只做轻量节流
//   - 页面隐藏/关闭前用 sendBeacon 兜底发送未上报的缓冲
const ENDPOINT = '/api/client-errors';
const FLUSH_MS = 4000; // 缓冲刷新间隔
const MAX_BUFFER = 30; // 缓冲上限,超出丢弃最旧
const THROTTLE_MS = 2000; // 同类错误节流窗口

const buf = [];
let timer = null;
let sending = false;
const lastSent = new Map(); // key -> timestamp

function ctxInfo() {
  try {
    const c = window.__ctx;
    const out = {};
    if (c && c.player) {
      out.viewMode = c.player.viewMode;
      const p = c.player.pl && c.player.pl.p;
      if (p) out.playerPos = [Math.round(p.x), Math.round(p.y), Math.round(p.z)].join(',');
    }
    return out;
  } catch (e) {
    return {};
  }
}

function push(item) {
  try {
    // 已知可选资源(有优雅回退,如飞舟装饰 GLB)不再上报,避免日志噪音
    if (/models\/strawberry_ship\//.test(String(item.message || ''))) return;
    // 节流:同类(类型+消息)在窗口内只收一次
    const key = item.type + '|' + String(item.message || '').slice(0, 120);
    const now = Date.now();
    const last = lastSent.get(key) || 0;
    if (now - last < THROTTLE_MS) return;
    lastSent.set(key, now);

    // 规范字段(2026-09-06):每条必带 页面 URL / UA / 当前世界,后台可直接定位
    buf.push(
      Object.assign(
        {
          t: now,
          ua: navigator.userAgent,
          url: String(location.href).slice(0, 200),
          world: (window.__ctx && window.__ctx.scene && window.__ctx.scene.activeWorld) || 'main',
        },
        ctxInfo(),
        item
      )
    );
    if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
    schedule();
  } catch (e) {
    /* 采集本身绝不影响游戏 */
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(flush, FLUSH_MS);
}

function flush(useBeacon) {
  timer = null;
  if (!buf.length || sending) return;
  const items = buf.splice(0, buf.length);
  sending = true;
  try {
    const body = JSON.stringify({ items });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      sending = false;
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
      .then(() => {})
      .catch(() => {})
      .finally(() => { sending = false; });
  } catch (e) {
    sending = false;
  }
}

// ---------- 1. 未捕获异常 ----------
window.addEventListener('error', (e) => {
  // 资源加载错误也走 error 事件(target 不是 window),单独归类
  const t = e.target;
  if (t && t !== window && (t.src || t.href)) {
    push({
      type: 'resource',
      message: '资源加载失败: ' + (t.src || t.href).slice(0, 180),
      source: t.tagName ? t.tagName.toLowerCase() : 'resource',
    });
    return;
  }
  push({
    type: 'js',
    message: e.message || String(e.error || 'unknown'),
    source: e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : '',
    lineno: e.lineno,
    colno: e.colno,
    stack: e.error && e.error.stack ? e.error.stack : '',
  });
}, true); // 捕获阶段:才能收到资源加载失败(它不冒泡)

// ---------- 2. 未处理的 Promise 拒绝 ----------
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  push({
    type: 'promise',
    message: (r && r.message) || String(r || 'unhandled rejection').slice(0, 300),
    stack: r && r.stack ? r.stack : '',
  });
});

// ---------- 3. WebGL context lost ----------
window.addEventListener('load', () => {
  try {
    const cvs = document.querySelectorAll('canvas');
    cvs.forEach((cv) => {
      cv.addEventListener('webglcontextlost', (e) => {
        push({ type: 'webgl', message: 'WebGL 上下文丢失(可能黑屏/冻结)', source: cv.id || 'canvas' });
      });
    });
  } catch (e) {}
});

// ---------- 4. fetch 失败 ----------
try {
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      return origFetch.apply(this, args).catch((err) => {
        try {
          const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          // 忽略故意探测的接口(如未开启的功能),只记真实失败
          push({ type: 'network', message: '请求失败: ' + String(u).slice(0, 160), source: String(err && err.message || err) });
        } catch (e) {}
        throw err; // 不改变原语义,继续把错误抛给调用方
      });
    };
  }
} catch (e) {}

// ---------- 5. 兜底:console.error 也可选上报(默认关,避免噪音) ----------
// 需要时在主控台执行 window.__errCaptureConsole(true) 打开
try {
  const origErr = console.error;
  let captureConsole = false;
  expose('errCaptureConsole', (on) => { captureConsole = !!on; });
  console.error = function (...a) {
    if (captureConsole) {
      try {
        push({ type: 'js', message: 'console.error: ' + a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 300), source: 'console' });
      } catch (e) {}
    }
    return origErr.apply(this, a);
  };
} catch (e) {}

// ---------- 离场兜底 ----------
window.addEventListener('pagehide', () => flush(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush(true);
});

// 供手动上报(业务代码可主动记录,比如"模型加载三次都失败")
expose('reportError', (type, message, extra) => push(Object.assign({ type, message }, extra || {})));

export { push as reportError, flush };
