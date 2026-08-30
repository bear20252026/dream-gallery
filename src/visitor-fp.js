// visitor-fp.js — 访客身份采集与踢出通知(2026-08-30 权限精简配套)
// 职责:
//   1. 持久设备 ID:localStorage + IndexedDB + Cookie 三处冗余,互相恢复(清 Cookie 不丢)
//   2. 多维指纹采集:硬件+canvas / WebGL GPU / AudioContext,进馆后静默上报归档
//   3. 强信号踢出命中:上报时服务端发现本机命中"已踢出"档案 → 自动跳申请页(防清 Cookie 绕过)
//   4. SSE 监听 /api/entry/watch:被踢出时立即弹回申请页
// 均为无感操作,不阻塞游戏加载。
(function () {
  'use strict';

  // ---------- 持久 ID(三处冗余) ----------
  const LS_KEY = '_galDevId';
  var localId = '';
  try { localId = localStorage.getItem(LS_KEY) || ''; } catch (e) {}
  if (!localId) {
    try {
      var m = document.cookie.match(/(?:^|;\s*)_galDevId=([^;]+)/);
      if (m) localId = m[1];
    } catch (e) {}
  }
  if (!localId) {
    localId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  // 写回三处(每次都写,修复丢失的副本)
  try { localStorage.setItem(LS_KEY, localId); } catch (e) {}
  try {
    document.cookie = '_galDevId=' + localId + '; Path=/; Max-Age=31536000; SameSite=Lax';
  } catch (e) {}
  try {
    var idb = indexedDB.open('_galDb', 1);
    idb.onupgradeneeded = function () { idb.result.createObjectStore('kv'); };
    idb.onsuccess = function () {
      try {
        var tx = idb.result.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(localId, 'devId');
      } catch (e) {}
    };
  } catch (e) {}

  // ---------- 指纹采集 ----------
  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  function collect() {
    var fp = {};
    fp.scr = screen.width + 'x' + screen.height + 'x' + (window.devicePixelRatio || 1);
    fp.avail = screen.availWidth + 'x' + screen.availHeight;
    fp.tz = new Date().getTimezoneOffset();
    fp.lang = navigator.language || '';
    fp.langs = (navigator.languages || []).join(',');
    fp.platform = navigator.platform || '';
    fp.cores = navigator.hardwareConcurrency || 0;
    fp.mem = navigator.deviceMemory || 0;
    fp.touch = 'ontouchstart' in window;
    fp.maxTouch = navigator.maxTouchPoints || 0;

    // canvas 渲染指纹
    fp.canvas = safe(function () {
      var cv = document.createElement('canvas');
      cv.width = 200; cv.height = 30;
      var cx = cv.getContext('2d');
      cx.textBaseline = 'top';
      cx.font = '14px Arial';
      cx.fillStyle = '#f60';
      cx.fillRect(0, 0, 100, 30);
      cx.fillStyle = '#069';
      cx.fillText('梦幻画廊·fp', 2, 4);
      cx.strokeStyle = 'rgba(120,60,200,0.7)';
      cx.arc(150, 15, 10, 0, Math.PI * 2);
      cx.stroke();
      var durl = cv.toDataURL(), h = 0;
      for (var i = 0; i < durl.length; i++) h = ((h << 5) - h + durl.charCodeAt(i)) | 0;
      return (h >>> 0).toString(16);
    });

    // WebGL GPU 渲染器(换浏览器不变,强信号)
    fp.webgl = safe(function () {
      var cv = document.createElement('canvas');
      var gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (!gl) return '';
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : '';
      var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      return (vendor || '') + '|' + (renderer || gl.getParameter(gl.RENDERER) || '');
    });

    // AudioContext 指纹(强信号)
    fp.audio = safe(function () {
      var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AC) return '';
      var ctx = new AC(1, 4410, 44100);
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      var comp = ctx.createDynamicsCompressor();
      osc.connect(comp); comp.connect(ctx.destination);
      osc.start(0);
      return new Promise(function (resolve) {
        ctx.oncomplete = function (e) { resolve(String(e.renderedBuffer.getChannelData(0).slice(4500, 5000).reduce(function (a, b) { return a + Math.abs(b); }, 0))); };
        setTimeout(function () { resolve(''); }, 1200);
      });
    });
    return fp;
  }

  // ---------- 上报(含踢出命中检测) ----------
  function report() {
    var fp = collect();
    Promise.resolve(fp.audio || Promise.resolve('')).then(function (audio) {
      if (audio !== undefined) fp.audio = audio;
      fetch('/api/entry/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lid: localId, fp: fp }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          // 本机命中已踢出档案(清 Cookie 绕过被识破)→ 弹回申请页
          if (d && d.deny) location.reload();
        })
        .catch(function () {});
    });
  }
  // 进馆 3 秒后上报(避让首屏加载)
  setTimeout(report, 3000);

  // ---------- SSE:被踢出立即弹回申请页 ----------
  safe(function () {
    var es = new EventSource('/api/entry/watch');
    es.onmessage = function (ev) {
      if (ev.data && ev.data.indexOf('kick') >= 0) location.reload();
    };
    es.onerror = function () {}; // 浏览器原生自动重连
  });
})();
