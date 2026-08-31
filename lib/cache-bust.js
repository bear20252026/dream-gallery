// 一次性强制刷新(2026-08-31 主人定):所有人第一次进入时统一刷新一遍缓存,之后不再刷。
//
// 需求背景:新上传的照片/新版前端在部分访客侧看不到——浏览器与 Cloudflare 边缘缓存了旧资源。
// 需求约束:"只刷新一遍,以现在为时间起点"。
//
// 实现:
//   1) 服务端在 index.html 里注入一段一次性脚本(仅在主页 HTML 注入,不碰其它资源)。
//   2) 脚本读 localStorage 标记 KEY;没有 → 打标记 → 清 Cache Storage → 强制 reload(绕过 HTTP 缓存)。
//      已有 → 什么都不做。因此每个浏览器/设备只刷一次,不会循环刷新。
//   3) INJECT_UNTIL 之后服务端停止注入(老客早就刷过了,新客拿到的本就是新资源)。
//      代码留着无害:换 KEY 即可再发起新的一轮。
'use strict';

// 每轮刷新一个唯一 KEY(改这个字符串 = 发起新的一轮强制刷新)
const BUST_KEY = 'dg_bust_20260831_2245';
// 服务端注入截止:以现在为时间起点,7 天后停止注入
const INJECT_UNTIL = Date.parse('2026-09-07T22:45:00+08:00');

function shouldInject() {
  return Date.now() < INJECT_UNTIL;
}

// 注入到 </head> 之前。用 IIFE 且不依赖任何外部脚本,保证最先执行。
function injectScript() {
  return (
    '<script>(function(){var K=' +
    JSON.stringify(BUST_KEY) +
    ';try{if(localStorage.getItem(K))return;localStorage.setItem(K,String(Date.now()));}catch(e){return;}' +
    'window.__dgBust=1;' +
    'if(window.caches&&window.caches.keys){try{window.caches.keys().then(function(ks){ks.forEach(function(k){window.caches.delete(k);});}).catch(function(){});}catch(e){}}' +
    'setTimeout(function(){try{location.reload(true);}catch(e){location.reload();}},30);})();</script>'
  );
}

module.exports = { BUST_KEY, INJECT_UNTIL, shouldInject, injectScript };
