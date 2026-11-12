// cors.js — CORS 单一裁决的叶子实现(2026-11-11 全面审计 P3-4 配套下沉)
// 为什么单独一个文件:与 local-request.js 同一族——gate.js 的 SSE 响应头也要用 corsOriginFor,
// 而 gate → security → siteconfig → admin → gate 是环(no-circular 是硬闸,函数内延迟 require 也拦不住)。
// 把这条只依赖 config + local-request 两个叶子的纯裁决下沉到这里:security 仍 re-export corsOriginFor
// (对外口径一字未变),gate 改 require 本文件。⚠️ CORS 裁决的唯一实现就在这里,别再写第二份。
const { CORS_ALLOWLIST, CORS_ALLOW_ALL } = require('./config');
const { isLocalRequest } = require('./local-request');

// 预检(server.js OPTIONS)与真响应(applySecurityHeaders)与 SSE 共用同一个函数,
// 否则会出现「预检放行 A 域、真请求回 cloudbear」的自相矛盾组合。
// 返回 null = 不设 Access-Control-Allow-Origin(同源请求/不在 allowlist 的跨源请求)。
function corsOriginFor(req) {
  if (isLocalRequest(req)) return { origin: '*', vary: false };
  if (CORS_ALLOW_ALL) return { origin: '*', vary: false };
  const origin = String((req && req.headers && req.headers.origin) || '').trim().replace(/\/+$/, '');
  if (!origin || !CORS_ALLOWLIST.has(origin)) return null;
  return { origin, vary: true }; // 命中 allowlist 才回显该 Origin(单值头,逐请求匹配)
}

module.exports = { corsOriginFor };