// files-static.js — 静态文件服务:Range 流式 + 文本资源 gzip 内存缓存(2026-09-18 自 files.js 拆分,审计 P3b)
// 只做"读盘发文件"这一件事;上传/删除/压缩/AI 审核见 files-upload.js。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MIME } = require('./config');
const { sendJson } = require('./util');
// gzip 策略:html/js/mjs/css/json 且 >20KB 且客户端支持时,读入内存 gzip 后发送
// (媒体文件 Range 流式不受影响;文本缓存 5 分钟内存副本,弱网加载提速明显。
//  mtime 校验(2026-10-10):命中缓存后 stat 与条目 mtime 不同即重压——消灭
//  "改完文件最长 5 分钟供旧内容"的陈旧窗口(2026-07-27 血泪:改完立刻验证误判没部署上;
//  生产同样受益:发布落地后旧 gz 副本立即失效,不再依赖 5 分钟自然过期)。)
const gzipCache = new Map(); // filePath -> {t, buf, mtimeMs}
function tryGzip(req, res, filePath, type, cacheHeader, sec, lastMod) {
  if (!/text|javascript|json/.test(type)) return false;
  if (!(req.headers['accept-encoding'] || '').includes('gzip')) return false;
  try {
    const st = fs.statSync(filePath);
    if (st.size < 20 * 1024) return false;
    const hit = gzipCache.get(filePath);
    let buf;
    if (hit && hit.mtimeMs === st.mtimeMs) {
      buf = hit.buf; // 命中且文件未变(5 分钟 TTL 保留,防冷门旧条目常驻)
    } else {
      buf = zlib.gzipSync(fs.readFileSync(filePath), { level: 6 });
      gzipCache.set(filePath, { t: Date.now(), buf, mtimeMs: st.mtimeMs });
      if (gzipCache.size > 64) gzipCache.delete(gzipCache.keys().next().value);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Encoding': 'gzip',
      'Content-Length': buf.length,
      'Cache-Control': cacheHeader,
      'Last-Modified': lastMod,
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
    // 带内容哈希的构建产物(Vite assets/ 下 xxx-XXXXXXXX.js/.css/字体/图):内容永不变化
    //   → 长缓存 immutable(2026-09-24 加速:原 .js 一律 no-cache,每次回源 304 往返,
    //   Cloudflare 边缘还压 4h 浏览器 TTL,回访客每次重拉全部分包)
    const viteHashed = /[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_-]{8}\.(js|mjs|css|png|jpg|jpeg|webp|avif|woff2?|ttf|otf|svg)$/i.test(filePath);
    const cacheHeader = viteHashed
      ? 'public, max-age=31536000, immutable'
      : noCache
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

    // 协商缓存(2026-10-07 审查#5,全站最大性能改进点):全站此前无任何 ETag/Last-Modified,
    // no-cache 资源(含几十 MB 的 .glb 模型、全部 html/js)每次回源都全量 200 重下。
    // 现补 Last-Modified;带 If-Modified-Since 的条件 GET 未变更时 304(几十字节),
    // Cloudflare 边缘与浏览器两侧同样受益 —— no-cache 的「每次校验」从重下变真校验。
    const lastMod = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();
    const ims = req.method === 'GET' && !range ? req.headers['if-modified-since'] : null;
    if (ims) {
      const since = Date.parse(ims);
      if (!isNaN(since) && since >= Math.floor(stat.mtimeMs / 1000) * 1000) {
        res.writeHead(304, {
          'Cache-Control': cacheHeader,
          'Last-Modified': lastMod,
          'Vary': 'Accept-Encoding',
          ...sec,
        });
        res.end();
        return;
      }
    }

    if (!range && tryGzip(req, res, filePath, type, cacheHeader, sec, lastMod)) return;

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
        'Last-Modified': lastMod,
        ...sec,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Content-Length': stat.size,
        'Cache-Control': cacheHeader,
        'Last-Modified': lastMod,
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
