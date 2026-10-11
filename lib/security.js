// security.js — 入口安全策略集合(2026-09-18 自 server.js 下沉,审计 P3b)
// server.js 只保留 require+分发+listen;本文件收拢:本地判定/静态黑名单/全局安全头(CSP+CORS)/媒体门禁/入口 HTML 注入。
const fs = require('fs');
const { CORS_ALLOWLIST, CORS_ALLOW_ALL } = require('./config');
const { sendJson } = require('./util');
const canServeMediaRef = () => require('./siteconfig').canServeMedia; // 懒加载防循环(files→siteconfig→mediarules)
const cacheBust = require('./cache-bust'); // 一次性强制刷新(2026-08-31)

// ===================== 「仅本地」判定(2026-10-11 DG-AUTH-001) =====================
// 规矩:安全决策的「本地」只认 TCP 来源地址。Host 头是客户端可任意伪造的——
// 伪造 `Host: localhost` 就能打通 auth:'write'(公开上传兜底/大屏替换/文件删除)与 src/ 源码目录。
const LOCAL_ADDR_RE = /^(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const LOCAL_HOST_RE = /^(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(:\d+)?$/i;
function isLocalRequest(req) {
  const addr = String((req && req.socket && req.socket.remoteAddress) || '');
  // 取不到来源地址(Unix socket / socket 已销毁)一律按非本地:安全判定宁严勿宽
  if (!addr || !LOCAL_ADDR_RE.test(addr)) return false;
  // Host 在这里只用于「否决」,绝不用于「放行」:回环连接却带公网 Host = 本机反代或
  // Cloudflare Tunnel 回源(访客真实来自公网),此时不能给本地特权。
  // 经 Cloudflare 代理直接回源时来源地址就是 CF 公网段 → 非本地(正确)。
  const host = String((req && req.headers && req.headers.host) || '');
  if (host && !LOCAL_HOST_RE.test(host)) return false;
  return true;
}

// ===================== CORS 单一裁决处(2026-10-11 DG-CORS-002) =====================
// 预检(server.js OPTIONS)与真响应(applySecurityHeaders)必须共用同一个函数,
// 否则会出现「预检放行 A 域、真请求回 cloudbear」的自相矛盾组合。
// 返回 null = 不设 Access-Control-Allow-Origin(同源请求/不在 allowlist 的跨源请求)。
function corsOriginFor(req) {
  if (isLocalRequest(req)) return { origin: '*', vary: false };
  if (CORS_ALLOW_ALL) return { origin: '*', vary: false };
  const origin = String((req && req.headers && req.headers.origin) || '').trim().replace(/\/+$/, '');
  if (!origin || !CORS_ALLOWLIST.has(origin)) return null;
  return { origin, vary: true }; // 命中 allowlist 才回显该 Origin(单值头,逐请求匹配)
}

// 同源/白名单 Origin 判定(WS upgrade 守卫用,2026-10-11 DG-RT-001):
// allowlist 命中即放行;本地连接的 localhost 系 Origin(开发 Vite :5173 等)一并放行;其余一律拒。
function isAllowedOrigin(origin, req) {
  const o = String(origin || '').trim().replace(/\/+$/, '');
  if (!o) return false;
  if (CORS_ALLOW_ALL) return true;
  if (CORS_ALLOWLIST.has(o)) return true;
  if (!isLocalRequest(req)) return false;
  try {
    return LOCAL_HOST_RE.test(new URL(o).host);
  } catch {
    return false;
  }
}

// ===================== 根级可服务文件白名单(2026-10-11 OPS-004) =====================
// ⚠️ 新增根级公开文件必须在这里登记,否则公网 404。
// 与 scripts/deploy.sh 的根级上传清单保持一致(dist/*.html + sw.js + manifest.json + data.js)。
// 理由:线上 /opt/gallery 会被 backend-sync.sh 备份成 `server.js.bak-<时间戳>` 这类
// 不以 .js/.bak 结尾的文件,老的「结尾锚」规则全部挡不住 → 后端源码以 octet-stream 公网流式回传。
// 扩展名集刻意不含 .js(根级 js 由上面的专条只管 data.js/sw.js);.mjs 保留=现网既有可服务的
// ES 模块口径(scripts/test/test.js 的 gz 缓存探针写根级 .mjs 夹具)。
const ROOT_PUBLIC_EXT = new Set(['.html', '.htm', '.mjs', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']);
const ROOT_PUBLIC_FILES = new Set([
  'index.html', 'guide.html', 'whiteboard.html', 'music.html', 'agreement.html', 'privacy.html',
  'community.html', 'lobby.html', 'room.html', 'official.html', 'forensics.html', 'tts-test.html',
  'data.js', 'sw.js', 'manifest.json', 'favicon.png', 'favicon.ico', 'robots.txt',
]);
function rootExtOf(base) {
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

// 公开静态黑名单:点文件、后端目录、私钥/脚本/文档、数据库与清单文件
// 根目录 .js 仅放行 data.js/sw.js(前端 ESM 需要),其余根级 js 均为后端/工具脚本
// src/ 与 vendor/ 目录(可读源码):公网一律 404,仅本地放行(本地开发/test-mobile 依赖,按 socket 判定)
// scripts/ 目录(测试/探针/生成器):公网一律 404
function staticDenied(rel, req) {
  const seg = rel.split('/');
  const base = seg[seg.length - 1];
  const lower = base.toLowerCase();
  if (base.startsWith('.')) return true;
  // 任意路径段以点开头(如 .docs-bak/ 隐藏目录)与敏感后缀一律拒绝(2026-08-31 审计:client_errors.json 曾公网可下载)
  if (seg.some((x) => x.startsWith('.'))) return true;
  if (/\.(bak|cjs)$/.test(base)) return true;
  // 任何路径段「含 .bak」(含 .bak-时间戳)一律拒绝:不靠结尾锚(2026-10-11 OPS-004)
  if (seg.some((x) => x.toLowerCase().includes('.bak'))) return true;
  if (['lib', 'node_modules', 'origin', 'tools', 'questions', 'scripts', 'dist'].includes(seg[0])) return true;
  if (seg[0] === 'src' || seg[0] === 'vendor') {
    // 放行 Three.js 加载器依赖(浏览器 importmap 路径)
    if (rel.startsWith('vendor/examples/jsm/')) return false;
    if (!isLocalRequest(req)) return true;
  }
  if (/\.(pem|bat|sh|md|log)$/.test(base)) return true;
  if (['gate_data.json', 'package.json', 'package-lock.json', 'admin.html', 'docs.html', 'eslint.config.mjs'].includes(base)) return true;
  // 根目录 .json(客户端报错日志等)一律不服务;manifest.json 豁免(PWA 清单,公开元数据;
  // 2026-09-20 审计 M1 发现被此规则误拦,PWA 安装清单从未可达)
  if (seg.length === 1 && base.endsWith('.json') && base !== 'manifest.json') return true;
  if (seg.length === 1 && base.endsWith('.js') && !['data.js', 'sw.js'].includes(base)) return true;
  // 根级兜底(2026-10-11 OPS-004 关键条):扩展名不在白名单、名字也不在登记表内 → 一律 404。
  // 这样 *.bak-*、*.tmp、*~、编辑器残留、任何没登记的新文件都天然被挡,不必再追着补黑名单。
  if (seg.length === 1 && !ROOT_PUBLIC_FILES.has(lower) && !ROOT_PUBLIC_EXT.has(rootExtOf(lower))) return true;
  return false;
}

// 全局安全头(2026-08-22 大厂标准):CSP 限脚本/样式/连接来源;CORS 按 allowlist 匹配回显。
function applySecurityHeaders(req, res) {
  const cors = corsOriginFor(req);
  if (cors) res.setHeader('Access-Control-Allow-Origin', cors.origin);
  // ACAO 随 Origin 变化 ⇒ 缓存必须按 Origin 分键(静态响应的 Vary 由 files-static 覆盖,
  // 那里若要合并 Vary 需 getHeader 追加,不在本文件管辖)
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XFO 不全局设(2026-09-20 审计 M4 回归 2026-07-28 修订):公开页保持可被外链合法嵌套,
  // SAMEORIGIN 仅后台页设置——files-static.js 对 admin|docs.html 追加,此处不再全局覆盖。
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

module.exports = { staticDenied, applySecurityHeaders, mediaGate, serveEntryHtml, isLocalRequest, corsOriginFor, isAllowedOrigin };
