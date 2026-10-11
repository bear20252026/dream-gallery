// local-request.js — 「仅本地」判定的叶子实现(2026-10-12 自 lib/security.js 拆出)
// 为什么单独一个文件:`lib/security.js` 为了媒体门禁要 require `lib/siteconfig.js`,而 siteconfig 又
// require `lib/admin.js`(取 tokenOk);admin 若直接 require security 就成环 ⇒ depcruise 的 no-circular
// 是硬闸,且**函数内延迟 require 也拦不住**(依赖图是静态扫的,不看 require 写在哪)。
// 所以把这条不依赖任何本地模块的纯谓词下沉成叶子:security 仍导出 isLocalRequest(对外口径不变),
// admin/其他后端模块改 require 本文件。⚠️「本地」判定的唯一实现就在这里,别再写第二份。
//
// 规矩(2026-10-11 DG-AUTH-001):安全决策的「本地」只认 TCP 来源地址。Host 头是客户端可任意伪造的——
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

module.exports = { isLocalRequest, LOCAL_ADDR_RE, LOCAL_HOST_RE };
