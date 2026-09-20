// security.js — 入口安全策略集合(2026-09-18 自 server.js 下沉,审计 P3b)
// server.js 只保留 require+分发+listen;本文件收拢:静态黑名单/全局安全头(CSP+CORS)/媒体门禁/入口 HTML 注入。
const fs = require('fs');
const { sendJson } = require('./util');
const canServeMediaRef = () => require('./siteconfig').canServeMedia; // 懒加载防循环(files→siteconfig→mediarules)
const cacheBust = require('./cache-bust'); // 一次性强制刷新(2026-08-31)

// 公开静态黑名单:点文件、后端目录、私钥/脚本/文档、数据库与清单文件
// 根目录 .js 仅放行 data.js/sw.js(前端 ESM 需要),其余根级 js 均为后端/工具脚本
// src/ 与 vendor/ 目录(可读源码):公网一律 404,仅 localhost 放行(本地开发/test-mobile 依赖)
// scripts/ 目录(测试/探针/生成器):公网一律 404
function staticDenied(rel, req) {
  const seg = rel.split('/');
  const base = seg[seg.length - 1];
  if (base.startsWith('.')) return true;
  // 任意路径段以点开头(如 .docs-bak/ 隐藏目录)与敏感后缀一律拒绝(2026-08-31 审计:client_errors.json 曾公网可下载)
  if (seg.some((x) => x.startsWith('.'))) return true;
  if (/\.(bak|cjs)$/.test(base)) return true;
  if (['lib', 'node_modules', 'origin', 'tools', 'questions', 'scripts', 'dist'].includes(seg[0])) return true;
  if (seg[0] === 'src' || seg[0] === 'vendor') {
    // 放行 Three.js 加载器依赖(浏览器 importmap 路径)
    if (rel.startsWith('vendor/examples/jsm/')) return false;
    const host = String((req && req.headers && req.headers.host) || '');
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
  }
  if (/\.(pem|bat|sh|md|log)$/.test(base)) return true;
  if (['gate_data.json', 'package.json', 'package-lock.json', 'admin.html', 'docs.html'].includes(base)) return true;
  // 根目录 .json(客户端报错日志等)一律不服务
  if (seg.length === 1 && base.endsWith('.json')) return true;
  if (seg.length === 1 && base.endsWith('.js') && !['data.js', 'sw.js'].includes(base)) return true;
  return false;
}

// 全局安全头(2026-08-22 大厂标准):CSP 限脚本/样式/连接来源;CORS 仅本域+localhost
function applySecurityHeaders(req, res) {
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host || ''));
  if (isLocal) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://cloudbear.cloud');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP(2026-09-18 审计 P1#5 渐进收敛):
  //   - 保留 unsafe-inline:全站多页大量内联 <script>/样式,去 nonce 化是独立工程
  //   - 默认收起完整 unsafe-eval,改用 CSP3 的 wasm-unsafe-eval(Three/GLTF 链路需要 WebAssembly)
  //   - CSP_UNSAFE_EVAL=1 时恢复完整 unsafe-eval(排查动态着色器/旧兼容时用)
  const scriptSrc = process.env.CSP_UNSAFE_EVAL === '1'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com"
    : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://static.cloudflareinsights.com";
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      // blob: 必需 —— GLTFLoader 把 GLB 内嵌贴图转成 blob: URL 后再 fetch
      "connect-src 'self' blob: data: https://cloudbear.cloud https://cdn.cloudbear.cloud https://cloudflareinsights.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "frame-ancestors 'self'",
    ].join('; ')
  );
}

// 媒体文件级门禁(2026-07-26):普通用户仅演示照片/白板/户外大屏/本人上传,其余 403
function mediaGate(req, res, rel) {
  const m = rel.match(/^(photos|videos)\/(.+)$/);
  if (!m) return true;
  if (canServeMediaRef()(req, m[1], m[2])) return true;
  sendJson(res, 403, { error: '无权访问该文件' });
  return false;
}

// 一次性强制刷新注入(2026-08-31 主人定):入口 HTML 读盘后在 </head> 前注入一次性脚本。
//   HTML 本身 no-store,避免被缓存成"永久刷新循环";注入窗口过后自动停止。
//   SMOKE=1(CI 冒烟)跳过注入:强刷 reload 会中止无头浏览器首轮全部模块请求。
//   返回 true 表示已接管响应。
function serveEntryHtml(rel, res, filePath) {
  if (
    (rel === 'index.html' || rel === 'landing/index.html') &&
    process.env.SMOKE !== '1' &&
    cacheBust.shouldInject()
  ) {
    try {
      let html = fs.readFileSync(filePath, 'utf8');
      html = html.includes('</head>')
        ? html.replace('</head>', cacheBust.injectScript() + '</head>')
        : cacheBust.injectScript() + html;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(html);
      return true;
    } catch (e) {
      console.error('[cache-bust] 注入失败,回落常规静态服务:', e && (e.message || e));
    }
  }
  return false;
}

module.exports = { staticDenied, applySecurityHeaders, mediaGate, serveEntryHtml };
