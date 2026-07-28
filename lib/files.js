// 静态文件服务(支持 Range) + 文件列表/上传/删除 API
const fs = require('fs');
const path = require('path');
const { ROOT, MEDIA_DIRS, MIME } = require('./config');
const { sendJson, safeJoin, isValidName } = require('./util');

// ===================== 静态文件服务(支持 Range + 文本资源 gzip) =====================
// gzip 策略:html/js/mjs/css/json 且 >20KB 且客户端支持时,读入内存 gzip 后发送
// (媒体文件 Range 流式不受影响;文本缓存 5 分钟内存副本,弱网加载提速明显)
const zlib = require('zlib');
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
    // 代码文件禁缓存(避免浏览器运行旧版 JS/HTML)
    // 媒体缓存分级(2026-07-27 血泪:200 被 Cloudflare 边缘缓存后对全员公开,门禁形同虚设):
    //   按名字公开的(演示/白板/户外大屏)= public 1 天;门禁放行的(本人上传/特殊模式)= private no-store
    const noCache = ['.html', '.js', '.mjs', '.json'].includes(ext);
    const isMedia = /[\\/](photos|videos)[\\/]/.test(filePath);
    const cacheHeader = noCache ? 'no-cache' : (isMedia && req._mediaPublic !== true ? 'private, no-store' : 'public, max-age=86400');
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

// GET /api/files?dir=photos|videos|music
// 2026-07-26 媒体门禁:无 token 时按 canServeMedia 过滤(普通用户只见演示/白板/大屏/本人上传;后台带 token 见全量)
function handleList(req, res, query) {
  const dirs = query.dir ? [query.dir] : MEDIA_DIRS;
  if (dirs.some(d => !MEDIA_DIRS.includes(d))) {
    sendJson(res, 400, { error: 'dir 必须是: ' + MEDIA_DIRS.join(', ') });
    return;
  }
  const { tokenOk } = require('./admin');
  const { canServeMedia } = require('./siteconfig');
  const full = tokenOk(req, query);
  const result = {};
  for (const dir of dirs) {
    const dirPath = path.join(ROOT, dir);
    try {
      result[dir] = fs.readdirSync(dirPath)
        .filter(name => {
          try { return fs.statSync(path.join(dirPath, name)).isFile(); }
          catch { return false; }
        })
        .map(name => {
          const st = fs.statSync(path.join(dirPath, name));
          return {
            name,
            url: `/${dir}/${encodeURIComponent(name)}`,
            size: st.size,
            mtime: st.mtime.toISOString(),
          };
        })
        .filter(entry => full || dir === 'music' || canServeMedia(req, dir, entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      result[dir] = [];
    }
  }
  sendJson(res, 200, result);
}

// POST /api/upload?dir=photos&name=xxx.jpg
// 公开上传规则(2026-07-25 主人定):任何人可传照片/视频,无需后台同意、不限张数——
//   全量格式:图片含动图/表情包(jpg/png/webp/gif/bmp/avif/heic/heif/tiff/svg/ico),
//   视频全格式(mp4/webm/mov/m4v/mkv/avi/flv/wmv/ts/m2ts/3gp/mpg/mpeg)
//   图片 ≤50MB / 视频 ≤700MB / gateData.uploads 记录归属
//   普通用户互相看不到对方上传的图/视频,只有后台可见(可下载/查看/编辑)
const PUBLIC_IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif', '.tiff', '.tif', '.svg', '.ico'];
const PUBLIC_VID_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];
const PUBLIC_MAX_IMG = 50 * 1024 * 1024;
const PUBLIC_MAX_VID = 700 * 1024 * 1024;
function handleUpload(req, res, query, isPublic) {
  const { dir, name } = query;
  if (!MEDIA_DIRS.includes(dir)) {
    sendJson(res, 400, { error: 'dir 必须是: ' + MEDIA_DIRS.join(', ') });
    return;
  }
  if (!isValidName(name)) {
    sendJson(res, 400, { error: '文件名不合法' });
    return;
  }
  if (isPublic) {
    const ext = path.extname(name).toLowerCase();
    const isImg = dir === 'photos' && PUBLIC_IMG_EXT.includes(ext);
    const isVid = dir === 'videos' && PUBLIC_VID_EXT.includes(ext);
    if (!isImg && !isVid) {
      sendJson(res, 400, { error: '仅支持 photos 图片(全格式)和 videos 视频(全格式)' });
      return;
    }
    const maxBytes = isVid ? PUBLIC_MAX_VID : PUBLIC_MAX_IMG;
    const cl = parseInt(req.headers['content-length'] || '0', 10);
    if (cl > maxBytes) { sendJson(res, 413, { error: isVid ? '视频不能超过 700MB' : '图片不能超过 50MB' }); return; }
    const filePath = path.join(ROOT, dir, name);
    // 公开上传禁止覆盖已存在文件(2026-07-26):否则任何人可用同名文件替换画廊展品
    if (fs.existsSync(filePath)) { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
    const { gateData, saveGateData, deviceKey } = require('./store');
    if (!gateData.uploads) gateData.uploads = {};
    const dk = deviceKey(req);
    let bytes = 0, tooBig = false;
    const ws = fs.createWriteStream(filePath);
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes && !tooBig) {
        tooBig = true;
        ws.destroy();
        fs.unlink(filePath, () => {});
        sendJson(res, 413, { error: isVid ? '视频不能超过 700MB' : '图片不能超过 50MB' });
        req.destroy();
      }
    });
    req.pipe(ws);
    ws.on('finish', () => {
      if (tooBig) return;
      // aid=不可猜测访客身份(vid Cookie 优先,2026-07-28 审计加固;旧记录无 aid 走 UA 兜底)
      const aid = require('./store').ownerAid(req);
      gateData.uploads[name] = { dk, aid, ts: Date.now(), mt: require('crypto').randomBytes(10).toString('hex') };
      saveGateData();
      const st = fs.statSync(filePath);
      // mt=媒体令牌:客户端拼 ?mt= 过图片代理(QQ/UC 代理 UA 漂移时仍能认出本人,2026-07-27)
      sendJson(res, 201, { ok: true, name, url: `/${dir}/${encodeURIComponent(name)}`, size: st.size, mt: gateData.uploads[name].mt });
      // 后台异步压缩(2026-07-25 主人定):先放行响应,不占上传速度;完成后替换更小的版本
      setImmediate(() => compressJob(dir, name));
      // 反刷存储预警:速率/单文件/设备累计/全盘占用(abuse.js)
      try { require('./abuse').abuseCheck(dk, name, st.size); } catch (e) {}
    });
    ws.on('error', () => { if (!tooBig) sendJson(res, 500, { error: '写入失败' }); });
    return;
  }
  const filePath = path.join(ROOT, dir, name);
  const ws = fs.createWriteStream(filePath);
  req.pipe(ws);
  ws.on('finish', () => {
    const st = fs.statSync(filePath);
    sendJson(res, 201, { ok: true, name, url: `/${dir}/${encodeURIComponent(name)}`, size: st.size });
    // 白板新作即时推送(替代访客端 5s 轮询,2026-07-25):SSE 通知所有在线页面刷新作品墙
    if (/^whiteboard-/.test(name)) { try { require('./gate').sseKick(); } catch (e) {} }
  });
  ws.on('error', () => sendJson(res, 500, { error: '写入失败' }));
}

// ===================== 分片上传(2026-07-28 晚高峰应急,主人定) =====================
// 背景:Cloudflare 边缘→源站回源带宽被运营商压到 ~12-40KB/s,>1MB 的上传撑满 100s 超时 → 524。
// 方案:前端按 256KB 切片逐片 POST(每片几秒内完成),服务端按序暂存 .chunks/,最后一片触发改名+同一后处理。
// POST /api/upload/chunk?dir=photos&name=x.jpg&seq=0&total=8 (body=单片字节,公开,规则与直传一致)
const CHUNK_DIR = path.join(ROOT, '.chunks');     // 点目录,静态黑名单天然拦截公网
const CHUNK_MAX_BYTES = 400 * 1024;               // 单片硬上限(前端按 256KB 切)
const CHUNK_STALE_MS = 24 * 3600 * 1000;          // 超过 24h 的残片在下次组装时顺手清
function sweepStaleChunks() {
  try {
    for (const f of fs.readdirSync(CHUNK_DIR)) {
      try { if (Date.now() - fs.statSync(path.join(CHUNK_DIR, f)).mtimeMs > CHUNK_STALE_MS) fs.unlinkSync(path.join(CHUNK_DIR, f)); } catch (e) {}
    }
  } catch (e) {}
}
function handleUploadChunk(req, res, query) {
  const dir = query.dir, name = String(query.name || '');
  const seq = parseInt(query.seq, 10), total = parseInt(query.total, 10);
  if (!MEDIA_DIRS.includes(dir)) { sendJson(res, 400, { error: 'dir 必须是: ' + MEDIA_DIRS.join(', ') }); return; }
  if (!isValidName(name)) { sendJson(res, 400, { error: '文件名不合法' }); return; }
  const ext = path.extname(name).toLowerCase();
  const isImg = dir === 'photos' && PUBLIC_IMG_EXT.includes(ext);
  const isVid = dir === 'videos' && PUBLIC_VID_EXT.includes(ext);
  if (!isImg && !isVid) { sendJson(res, 400, { error: '仅支持 photos 图片(全格式)和 videos 视频(全格式)' }); return; }
  const maxBytes = isVid ? PUBLIC_MAX_VID : PUBLIC_MAX_IMG;
  if (!Number.isInteger(seq) || !Number.isInteger(total) || seq < 0 || total < 1 || seq >= total || total > 4000) { sendJson(res, 400, { error: '分片序号不合法' }); return; }
  const cl = parseInt(req.headers['content-length'] || '0', 10);
  if (cl > CHUNK_MAX_BYTES) { sendJson(res, 413, { error: '分片过大' }); return; }
  const finalPath = path.join(ROOT, dir, name);
  // 公开上传禁止覆盖(与直传同规;首片与组装时各查一次,防同名人竞速)
  if (fs.existsSync(finalPath)) { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
  try { fs.mkdirSync(CHUNK_DIR, { recursive: true }); } catch (e) {}
  const partPath = path.join(CHUNK_DIR, name + '.' + seq + '.part'); // isValidName 已挡斜杠,name 必为纯文件名
  let bytes = 0, tooBig = false;
  const ws = fs.createWriteStream(partPath);
  req.on('data', c => {
    bytes += c.length;
    if (bytes > CHUNK_MAX_BYTES && !tooBig) { tooBig = true; ws.destroy(); fs.unlink(partPath, () => {}); sendJson(res, 413, { error: '分片过大' }); req.destroy(); }
  });
  req.pipe(ws);
  ws.on('finish', () => {
    if (tooBig) return;
    if (seq < total - 1) { sendJson(res, 200, { ok: true, seq }); return; }
    // 最后一片:校验齐全 → 组装 → 清残片 → 与直传同一后处理
    try {
      sweepStaleChunks();
      const bufs = [];
      let totalSize = 0;
      for (let i = 0; i < total; i++) {
        const p = path.join(CHUNK_DIR, name + '.' + i + '.part');
        if (!fs.existsSync(p)) throw new Error('缺第 ' + (i + 1) + ' 片');
        const b = fs.readFileSync(p); bufs.push(b); totalSize += b.length;
      }
      if (totalSize > maxBytes) { sendJson(res, 413, { error: isVid ? '视频不能超过 700MB' : '图片不能超过 50MB' }); return; }
      if (fs.existsSync(finalPath)) { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
      fs.writeFileSync(finalPath, Buffer.concat(bufs));
      for (let i = 0; i < total; i++) fs.unlinkSync(path.join(CHUNK_DIR, name + '.' + i + '.part'));
    } catch (e) { sendJson(res, 409, { error: '分片不完整，请重传：' + e.message }); return; }
    const { gateData, saveGateData, deviceKey } = require('./store');
    if (!gateData.uploads) gateData.uploads = {};
    const dk = deviceKey(req);
    const aid = require('./store').ownerAid(req); // vid 优先(与直传同规)
    gateData.uploads[name] = { dk, aid, ts: Date.now(), mt: require('crypto').randomBytes(10).toString('hex') };
    saveGateData();
    const st = fs.statSync(finalPath);
    sendJson(res, 201, { ok: true, name, url: `/${dir}/${encodeURIComponent(name)}`, size: st.size, mt: gateData.uploads[name].mt });
    setImmediate(() => compressJob(dir, name)); // 后台异步压缩(与直传同规)
    try { require('./abuse').abuseCheck(dk, name, st.size); } catch (e) {}
  });
  ws.on('error', () => { if (!tooBig) sendJson(res, 500, { error: '写入失败' }); });
}

// DELETE /api/files/<dir>/<name>(token):后台删除,用户端立即不可见
// 同步清理上传归属/AI 配文/演示标记(否则 siteconfig 还会把名字发给本人)
function handleDelete(res, dir, name) {
  if (!MEDIA_DIRS.includes(dir)) {
    sendJson(res, 400, { error: 'dir 必须是: ' + MEDIA_DIRS.join(', ') });
    return;
  }
  if (!isValidName(name)) {
    sendJson(res, 400, { error: '文件名不合法' });
    return;
  }
  const filePath = safeJoin(path.join(dir, name));
  if (!filePath) {
    sendJson(res, 400, { error: '文件名不合法' });
    return;
  }
  fs.unlink(filePath, err => {
    if (err) sendJson(res, 404, { error: '文件不存在' });
    else {
      const { gateData, saveGateData } = require('./store');
      let dirty = false;
      if (gateData.uploads && gateData.uploads[name]) { delete gateData.uploads[name]; dirty = true; }
      if (gateData.photoCaptions && gateData.photoCaptions[name]) { delete gateData.photoCaptions[name]; dirty = true; }
      if (gateData.siteConfig && gateData.siteConfig.demoPhotos) {
        const i = gateData.siteConfig.demoPhotos.indexOf(name);
        if (i >= 0) { gateData.siteConfig.demoPhotos.splice(i, 1); dirty = true; }
      }
      if (dirty) saveGateData();
      sendJson(res, 200, { ok: true, name });
    }
  });
}

// ===================== 后台异步压缩(省存储,不占上传速度) =====================
// 规则:上传完成响应后才开始;单任务队列(2 核服务器);nice 低优先级;
// 只有压缩后更小才替换;视频统一转 mp4 时同步迁移 uploads/photoCaptions 记录;
// 图片必须保持原扩展名(画框按原文件名引用,改名会 404 白框),bmp/tiff 同格式压不动直接跳过
const { spawn } = require('child_process');
const compressQueue = [];
let compressing = false;
const VID_COMPRESS_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];
const IMG_COMPRESS_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function compressJob(dir, name) {
  compressQueue.push([dir, name]);
  if (!compressing) nextCompress();
}
function nextCompress() {
  const job = compressQueue.shift();
  if (!job) { compressing = false; return; }
  compressing = true;
  const [dir, name] = job;
  const done = () => setTimeout(nextCompress, 1000);
  try {
    const ext = path.extname(name).toLowerCase();
    const filePath = path.join(ROOT, dir, name);
    const size0 = fs.statSync(filePath).size;
    const isVid = dir === 'videos' && VID_COMPRESS_EXT.includes(ext);
    const isImg = dir === 'photos' && IMG_COMPRESS_EXT.includes(ext);
    // 小文件不动:图片 <1MB、已是 mp4 且 <20MB
    if ((!isVid && !isImg) || (isImg && size0 < 1024 * 1024) || (isVid && ext === '.mp4' && size0 < 20 * 1024 * 1024)) return done();
    const base = name.slice(0, name.length - ext.length);
    // 图片保持原扩展名输出(永不改名);只有视频才会转 .mp4
    const outExt = isVid ? '.mp4' : ext;
    const tmpPath = path.join(ROOT, dir, base + '.compressing' + outExt);
    const args = isVid
      ? ['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '800k', '-maxrate', '1000k', '-bufsize', '2000k', '-vf', "scale='min(1280,iw)':-2", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmpPath]
      : (ext === '.png'
        ? ['-y', '-i', filePath, '-vf', "scale='min(1920,iw)':-2", '-compression_level', '9', tmpPath]
        : ['-y', '-i', filePath, '-vf', "scale='min(1920,iw)':-2", '-q:v', '3', tmpPath]);
    const p = spawn('nice', ['-n', '19', 'ffmpeg', ...args], { stdio: 'ignore' });
    p.on('error', done);
    p.on('close', code => {
      try {
        if (code === 0 && fs.existsSync(tmpPath)) {
          const size1 = fs.statSync(tmpPath).size;
          if (size1 < size0 * 0.92) {
            // 明显更小才替换
            const newName = base + outExt;
            const newPath = path.join(ROOT, dir, newName);
            fs.renameSync(tmpPath, newPath);
            if (newName !== name) fs.unlink(filePath, () => {});
            const { gateData, saveGateData } = require('./store');
            let dirty = false;
            if (gateData.uploads && gateData.uploads[name] && newName !== name) {
              gateData.uploads[newName] = gateData.uploads[name];
              delete gateData.uploads[name]; dirty = true;
            }
            if (gateData.photoCaptions && gateData.photoCaptions[name] && newName !== name) {
              gateData.photoCaptions[newName] = gateData.photoCaptions[name];
              delete gateData.photoCaptions[name]; dirty = true;
            }
            if (dirty) saveGateData();
          } else {
            fs.unlink(tmpPath, () => {}); // 没省多少,保留原文件
          }
        }
      } catch (e) { /* 失败保原文件 */ }
      done();
    });
  } catch (e) { done(); }
}

module.exports = { serveStatic, handleList, handleUpload, handleUploadChunk, handleDelete };

// 供 lib/docs.js 保存文件后调用:清掉对应文件的 gzip 内存缓存,立即可见新版本
function clearGzipCache(filePath) {
  if (filePath) gzipCache.delete(filePath);
  else gzipCache.clear();
}
module.exports.clearGzipCache = clearGzipCache;
