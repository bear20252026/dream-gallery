// files-static.js — 静态文件服务:Range 流式 + 文本资源 gzip 内存缓存(2026-09-18 自 files.js 拆分,审计 P3b)
// 只做"读盘发文件"这一件事;上传/删除/压缩/AI 审核见 files-upload.js。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MIME } = require('./config');
const { sendJson } = require('./util');
// gzip 策略:html/js/mjs/css/json 且 >20KB 且客户端支持时,读入内存 gzip 后发送
// (媒体文件 Range 流式不受影响;文本缓存 5 分钟内存副本,弱网加载提速明显)
const gzipCache = new Map(); // filePath -> {t, buf}
function tryGzip(req, res, filePath, type, cacheHeader, sec) {
  if (!/text|javascript|json/.test(type)) return false;
  if (!(req.headers['accept-encoding'] || '').includes('gzip')) return false;
  try {
    const st = fs.statSync(filePath);
    if (st.size < 20 * 1024) return false;
    const hit = gzipCache.get(filePath);
    let buf;
    if (hit && Date.now() - hit.t < 5 * 60 * 1000) { buf = hit.buf; }
    else {
      buf = zlib.gzipSync(fs.readFileSync(filePath), { level: 6 });
      gzipCache.set(filePath, { t: Date.now(), buf });
      if (gzipCache.size > 64) gzipCache.delete(gzipCache.keys().next().value);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Encoding': 'gzip',
      'Content-Length': buf.length,
      'Cache-Control': cacheHeader,
      'Vary': 'Accept-Encoding',
      ...(sec || {}),
    });
    res.end(buf);
    return true;
  } catch (e) { return false; }
}

function serveStatic(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: '文件不存在' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // 代码+音乐文件禁缓存(避免浏览器运行旧版 JS/HTML;音乐文件更新后即时生效)
    // 媒体缓存分级(2026-07-27 血泪:200 被 Cloudflare 边缘缓存后对全员公开,门禁形同虚设):
    //   按名字公开的(演示/白板/户外大屏)= no-cache(2026-08-31 改:原 public max-age=60,
    //     访客侧会滞后最多 60s 才看到新上传/替换的照片;no-cache 每次回源校验,内容一变立刻生效);
    //     门禁放行的(本人上传/特殊模式)= private no-store(不变)
    const noCache = ['.html', '.js', '.mjs', '.json', '.glb', '.gltf', '.m4a', '.mp3'].includes(ext);
    const isMedia = /[\\/](photos|videos)[\\/]/.test(filePath);
    const cacheHeader = noCache
      ? 'no-cache'
      : isMedia
        ? (req._mediaPublic === true ? 'no-cache' : 'private, no-store')
        : 'public, max-age=86400';
    // 安全头(2026-07-28 OWASP 审计):SVG 可含脚本,同源直开即 XSS(链:公开上传→/admin-media?token= 偷管理 token)——
    //   SVG 一律禁脚本;全部响应补 nosniff;XFO 只给后台页(2026-07-28 修订:全站 SAMEORIGIN 会误伤
    //   主站被 kimi.link 等外链页合法嵌套——点击劫持风险集中在 admin/docs,公开页保持可嵌套)
    const sec = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (ext === '.svg') { sec['Content-Security-Policy'] = "script-src 'none'; style-src 'unsafe-inline'"; }
    if (type.startsWith('text/html') && /[\\/](admin|docs)\.html$/.test(filePath)) { sec['X-Frame-Options'] = 'SAMEORIGIN'; }
    const range = req.headers.range;

    if (!range && tryGzip(req, res, filePath, type, cacheHeader, sec)) return;

    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (m && !m[1] && m[2]) {
        start = Math.max(stat.size - parseInt(m[2], 10), 0);
        end = stat.size - 1;
      }
      if (start >= stat.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': cacheHeader,
        ...sec,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Content-Length': stat.size,
        'Cache-Control': cacheHeader,
        ...sec,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}


// 供 lib/docs.js 保存文件后调用:清掉对应文件的 gzip 内存缓存,立即可见新版本
function clearGzipCache(filePath) {
  if (filePath) gzipCache.delete(filePath);
  else gzipCache.clear();
}
module.exports = { serveStatic, clearGzipCache };
