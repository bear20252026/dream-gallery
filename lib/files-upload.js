// files-upload.js — 媒体写路径:列表/直传/分片/删除/本人清单 + ffmpeg 压缩队列 + NSFW 审核(2026-09-18 自 files.js 拆分,审计 P3b)
// 静态读取见 files-static.js;上传后处理链(广播/R2 镜像/压缩/反刷)集中于本文件。
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ROOT, MEDIA_DIRS, TOKEN } = require('./config');
const { sendJson, safeJoin, isValidName } = require('./util');
const { mediaBroadcast } = require('./media-push'); // 增删文件后推送游戏端即时刷新(2026-08-29)
// 媒体镜像统一走 r2outbox(2026-10-11 DG-R2-003):先落**持久待发台账**再 fire-and-forget ——
// 成功即出账,失败由台账按退避接着重试(进程重启也接得上);r2sync 不再由本文件直连
const r2outbox = require('./r2outbox');
const { chatVision } = require('./aichannels');
// spawn 走调用期取用(不在顶层解构):单测据此可桩掉 ffmpeg,不必依赖真二进制
function spawnProc(cmd, args, opts) { return require('child_process').spawn(cmd, args, opts); }
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
//   全量格式:图片含动图/表情包(jpg/png/webp/gif/bmp/avif/heic/heif/tiff/ico;svg 已移除),
//   视频全格式(mp4/webm/mov/m4v/mkv/avi/flv/wmv/ts/m2ts/3gp/mpg/mpeg)
// SVG 已移除(2026-07-31):SVG 可含脚本导致 XSS,即使有 CSP script-src 'none' 仍需额外维护
//   图片 ≤50MB / 视频 ≤700MB / gateData.uploads 记录归属
//   普通用户互相看不到对方上传的图/视频,只有后台可见(可下载/查看/编辑)
// SVG 已移除(2026-07-31):SVG 可含脚本导致 XSS,即使有 CSP script-src 'none' 仍需额外维护
const PUBLIC_IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif', '.tiff', '.tif', '.ico'];
const PUBLIC_VID_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];
const PUBLIC_MAX_IMG = 50 * 1024 * 1024;
const PUBLIC_MAX_VID = 700 * 1024 * 1024;

// 白板作品=匿名公开展品(非 public 分支里唯一面向全员的通道),NSFW 审计适用
function isPublicLike(dir, name) {
  return dir === 'photos' && /^whiteboard-[\w-]+\.(png|jpe?g|webp)$/i.test(name);
}

// 服务端签发白板作品名(2026-10-12 DG-SEC-001):前端只保存"服务端回的那个名字",
// 匿名侧再也落不到自己挑的名字上 ⇒ "知道别人的文件名就能替换那幅画"这条路从源头消失。
// 形态必须匹配路由 guard 的 ^whiteboard-[\w-]+\.(png|jpe?g|webp)$;保留时间戳是因为
// 白板作品管理面板与作品墙都按名字读时间(旧名字本就是 whiteboard-<ISO 时间>.png)。
function newWhiteboardName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'whiteboard-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
    '-' + crypto.randomBytes(4).toString('hex') + '.png';
}

// 容量/并发硬闸的拒绝出口(2026-10-12 DG-SEC-005):503 + Retry-After,
// 拒绝时一个字节都还没写、文件都还没打开。reason 回给前端,便于"为什么传不上去"自查。
function sendCapacityReject(res, slot) {
  try { if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(slot.retryAfter || 30)); } catch (e) {}
  sendJson(res, slot.status || 503, {
    error: '画廊存储容量或写入并发已达上限，请稍后再试',
    reason: slot.reason, detail: slot.detail, retryAfter: slot.retryAfter,
  });
}

// ===================== R2 镜像自愈(2026-10-11 DG-R2-002 → DG-R2-003 持久台账) =====================
// 病根:媒体镜像原先全是 r2Put(...).catch(()=>{}) 的一次性 fire-and-forget,失败后该对象永久缺席 R2,
//   而媒体侧(照片/视频/大屏)没有任何 tts 那种"命中补推"补偿。
// 现在的两层补偿(语义仿 lib/tts.js r2Heal,但底下接的是持久台账 lib/r2outbox.js):
//   ① 进程内 r2Failed 集合:供"媒体命中源站文件时补推一次"用(r2HealMedia,调用点在
//      lib/files-static.js 的媒体服务路径 —— 该文件本轮禁改,接线待主代理补一行);
//   ② 持久台账:每次镜像事件**先记账再推**,推失败就把这条留在台账里按 30s→2m→10m→1h→6h 退避重试,
//      重启不丢(台账不进 gateData,独立小文件 .r2-outbox.json,公网被 staticDenied 三重挡住)。
const r2Failed = new Set(); // 'dir|name' — 本进程见过失败的镜像键(①的账本)
const r2Pushing = new Set(); // 正在补推,去重防并发重复 PUT
function r2Key(dir, name) { return r2outbox.keyOf(dir, name); }
// 镜像一个媒体对象:记账 + 立即试一次(全异步,响应早已发出,不占上传时延)
function r2Mirror(dir, name, filePath) {
  const k = r2Key(dir, name);
  r2Failed.delete(k); // 新的事件:历史失败标记先摘掉,结论由本次尝试决定
  try {
    Promise.resolve(r2outbox.syncPut(dir, name, filePath)).then(
      st => { if (st === 'fail') r2Failed.add(k); },
      () => r2Failed.add(k)
    );
  } catch (e) { r2Failed.add(k); }
}
// 命中源站文件时调用:该对象曾在失败集合里才补推;返回是否发起了补推
function r2HealMedia(dir, name, filePath) {
  const k = r2Key(dir, name);
  if (!r2Failed.has(k) || r2Pushing.has(k)) return false;
  r2Pushing.add(k);
  try {
    Promise.resolve(r2outbox.syncPut(dir, name, filePath)).then(
      st => { r2Pushing.delete(k); if (st === 'ok') r2Failed.delete(k); },
      () => { r2Pushing.delete(k); }
    );
  } catch (e) { r2Pushing.delete(k); }
  return true;
}
// 待补推清单:进程内失败集合 ∪ 持久台账(台账里躺着的就是"CDN 目前可能没有"的对象)
function r2PendingMedia() {
  let keys = [];
  try { keys = r2outbox.pendingKeys(); } catch (e) {}
  return Array.from(new Set([...Array.from(r2Failed), ...keys])).sort();
}

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
    const { gateData, saveGateData, deviceKey } = require('./store');
    // DG-UP-003:反刷的 BIGFILE(300MB)判定前移到 Content-Length 阶段——原先要整份写盘后才发现,
    //   等于允许攻击者每次刷满 300~700MB 的真实 I/O;设备累计与速率仍在写完后判(需要落盘尺寸/记录)。
    if (cl > 0) {
      let preBlock = null;
      try { preBlock = require('./abuse').abuseSizePrecheck(deviceKey(req), name, cl); } catch (e) {}
      if (preBlock === 'bigfile') { sendJson(res, 429, { error: '单文件超过 300MB 上限，请压小后再上传' }); return; }
    }
    const filePath = path.join(ROOT, dir, name);
    // DG-SEC-005 写盘前硬闸:目标盘剩余低于水位 / 媒体总量+在途预留超预算 / 同时在写的人太多 ⇒ 503。
    //   预约体积用 Content-Length(没带就按典型照片体积兜底),绝不给匿名请求开"零体积"的空头。
    const abuseMod = require('./abuse');
    const slot = abuseMod.reserveUploadSlot('public', cl > 0 ? cl : abuseMod.SLOT_RESERVE_FALLBACK, path.join(ROOT, dir));
    if (!slot.allow) { sendCapacityReject(res, slot); return; }
    const freeSlot = () => { try { slot.done(); } catch (e) {} };
    // 公开上传禁止覆盖已存在文件(2026-07-26):否则任何人可用同名文件替换画廊展品。
    // DG-FILE-001#3:'wx' 独占创建把"查存在→开写"两步并成一个原子动作,堵掉并发同名竞态
    //   (原 existsSync 与 createWriteStream 之间两个请求可同时通过检查,后完成者覆盖前者)。
    let fd;
    try { fd = fs.openSync(filePath, 'wx'); }
    catch (e) {
      freeSlot();
      if (e && e.code === 'EEXIST') { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
      sendJson(res, 500, { error: '写入失败' });
      return;
    }
    if (!gateData.uploads) gateData.uploads = {};
    const dk = deviceKey(req);
    let bytes = 0, tooBig = false;
    const ws = fs.createWriteStream(filePath, { fd });
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes && !tooBig) {
        tooBig = true;
        freeSlot();
        ws.destroy();
        fs.unlink(filePath, () => {});
        sendJson(res, 413, { error: isVid ? '视频不能超过 700MB' : '图片不能超过 50MB' });
        req.destroy();
      }
    });
    // 客户端断连也是"结束路径":还位在账(幂等,漏掉则由 abuse.js 的 5 分钟兜底闸回收)
    req.on('aborted', freeSlot);
    req.on('close', freeSlot);
    req.pipe(ws);
    ws.on('finish', async () => {
      if (tooBig) return;
      freeSlot();
      // C8 NSFW 审核:图片写完后过 vision 双通道,违规即删+拒传
      // 本人私有照片(自己看自己,不外泄)按既定口径维持:'unavailable'(审核不可用)仍放行
      if (isImg) {
        const verdict = await moderateImage(filePath);
        if (verdict === 'block') {
          try { fs.unlink(filePath, () => {}); } catch (e) {}
          if (!res.writableEnded) sendJson(res, 422, { error: '这片灵蕴暂时无法归位' });
          return;
        }
      }
      // aid=不可猜测访客身份(vid Cookie 优先,2026-07-28 审计加固;旧记录无 aid 走 UA 兜底)
      const aid = require('./store').ownerAid(req);
      const st = fs.statSync(filePath);
      gateData.uploads[name] = { dk, aid, ts: Date.now(), mt: require('crypto').randomBytes(10).toString('hex') };
      // 2026-09-18 审计 P2#8:反刷硬拒(速率/单文件/设备累计)——超限删文件并 429
      let abuseBlock = null;
      try { abuseBlock = require('./abuse').abuseCheck(dk, name, st.size); } catch (e) {}
      if (abuseBlock && abuseBlock !== 'storage') {
        try { fs.unlinkSync(filePath); } catch (e) {}
        delete gateData.uploads[name];
        try { saveGateData(); } catch (e) {}
        sendJson(res, 429, { error: '上传过于频繁或超出设备配额，请稍后再试' });
        return;
      }
      saveGateData();
      sendJson(res, 201, { ok: true, name, url: `/${dir}/${encodeURIComponent(name)}`, size: st.size, mt: gateData.uploads[name].mt });
      try { mediaBroadcast({ dir, name }); } catch (e) {}
      r2Mirror(dir, name, filePath);
      setImmediate(() => compressJob(dir, name));
    });
    ws.on('error', () => { freeSlot(); if (!tooBig) sendJson(res, 500, { error: '写入失败' }); });
    return;
  }
  // ===================== 非公开分支:白板(匿名)+ 后台 token 直传 =====================
  // DG-SEC-001(2026-10-12):这一支原先是 fs.createWriteStream(filePath) 裸截断,且路由 guard 只管扩展名、
  //   没有任何归属校验 —— 知道既有白板作品文件名的人(后台列表、/api/files、作品墙上都看得到)
  //   就能把画廊墙上那幅画换成自己的图,不需要先攻破管理员鉴权。
  // 现在的规矩:① 新作品名字由服务端签发 + 'wx' 独占创建(匿名侧再也落不到自己挑的名字上);
  //   ② 覆盖只允许"服务端签发给本人"的既有作品(gateData.uploads[name].aid === authVid(req));
  //   ③ 判定全部在打开文件之前 ⇒ 不属于自己的一律 409,原文件一个字节都不动;
  //   ④ 后台 token 直传(auth:'write')语义一字不改:自己挑名字、允许覆盖(主人要改要换画照旧)。
  const { gateData, saveGateData, deviceKey, authVid } = require('./store');
  const { isLocalRequest } = require('./local-request'); // 叶子实现(security 也从这里转出)
  let adminWrite = false;
  try { adminWrite = require('./admin').tokenOk(req, query); } catch (e) { adminWrite = false; }
  // 未配置 TOKEN 时的本地写权 = 路由 auth:'write' 的同款判据(同一台机器口径,别再信 Host 头)
  if (!adminWrite && !TOKEN) adminWrite = isLocalRequest(req);

  let finalName = name;
  let filePath = path.join(ROOT, dir, finalName);
  let overwriteOwn = false;  // 白板:本人既有作品的合法重保存(允许截断,这正是白板的产品行为)
  let exclusiveNew = false;  // 白板:新作品(独占创建,同名双请求只有一个能建成)

  if (!adminWrite) {
    // 匿名侧只剩白板这一条路。路由 guard 只钉名字,这里把目录一起钉死:
    //   此前 dir=videos|music 配一个 whiteboard-*.png 的名字也能走进来(匿名写媒体目录=第二个洞)
    if (!isPublicLike(dir, finalName)) {
      sendJson(res, 403, { error: '这个接口只保存白板作品(photos 目录的 whiteboard-*.png/jpg/webp)' });
      return;
    }
    let exists = false;
    try { exists = fs.existsSync(filePath); } catch (e) {}
    const rec = (gateData.uploads || {})[finalName];
    if (exists || rec) {
      const vid = authVid(req);
      // 没表明身份(无 Cookie / 会话过期 / 已被吊销)⇒ 401:这一类请求连"我是谁"都没说,
      //   与"你是你、但这幅画不是你的"(409)分开,前端才能给出对的自助出路(回游戏页重新进入)
      if (!vid) { sendJson(res, 401, { error: '更新这幅白板作品需要有效的访客身份，请回到游戏页重新进入后再保存' }); return; }
      // 既有作品没有归属记录(2026-10-12 之前的存量)或归属不是本人 ⇒ 拒,且判在开文件之前
      if (!rec || rec.aid !== vid) { sendJson(res, 409, { error: '这不是你的作品，无法覆盖；请直接保存成新的一幅' }); return; }
      overwriteOwn = true;
    } else {
      finalName = newWhiteboardName();
      filePath = path.join(ROOT, dir, finalName);
      exclusiveNew = true;
    }
  }

  // 大小上限(2026-08-31 审计 H4):非 public 分支原先无任何上限,单请求可写满磁盘。
  // 与 public 同规:videos 700MB / photos 50MB(白板扩展名已在路由 guard 限死为图片)
  const maxBytes = dir === 'videos' ? PUBLIC_MAX_VID : PUBLIC_MAX_IMG;
  // DG-SEC-005 写盘前硬闸(与公开分支同一套数):后台 token 一律放行,只记在途账
  const abuseMod = require('./abuse');
  const clN = parseInt(req.headers['content-length'] || '0', 10) || 0;
  const slotKind = adminWrite ? 'admin' : 'whiteboard';
  const slot = abuseMod.reserveUploadSlot(
    slotKind, clN > 0 ? clN : (adminWrite ? 0 : abuseMod.SLOT_RESERVE_FALLBACK), path.join(ROOT, dir));
  if (!slot.allow) { sendCapacityReject(res, slot); return; }
  const freeSlot = () => { try { slot.done(); } catch (e) {} };

  let fd = null, openErr = null;
  for (let attempt = 0; ; attempt++) {
    try { fd = fs.openSync(filePath, exclusiveNew ? 'wx' : 'w'); openErr = null; break; }
    catch (e) {
      openErr = e;
      // 服务端随机名理论会撞(撞了也绝不落到别人的文件上):换个名字重来,最多两次
      if (exclusiveNew && e && e.code === 'EEXIST' && attempt < 2) {
        finalName = newWhiteboardName();
        filePath = path.join(ROOT, dir, finalName);
        continue;
      }
      break;
    }
  }
  if (fd === null) {
    freeSlot();
    if (openErr && openErr.code === 'EEXIST') { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
    sendJson(res, 500, { error: '写入失败' });
    return;
  }
  const ws = fs.createWriteStream(filePath, { fd });
  let upBytes = 0, upTooBig = false;
  req.on('data', (c) => {
    upBytes += c.length;
    if (upBytes > maxBytes && !upTooBig) {
      upTooBig = true;
      freeSlot();
      ws.destroy();
      fs.unlink(filePath, () => {});
      sendJson(res, 413, { error: dir === 'videos' ? '视频不能超过 700MB' : '文件不能超过 50MB' });
      req.destroy();
    }
  });
  // 客户端断连也是"结束路径":还位在账(幂等;真漏了由 abuse.js 的 5 分钟兜底闸回收)
  req.on('aborted', freeSlot);
  req.on('close', freeSlot);
  req.pipe(ws);
  ws.on('finish', async () => {
    if (upTooBig) return;
    freeSlot();
    let st;
    try { st = fs.statSync(filePath); } catch (e) { sendJson(res, 500, { error: '文件状态异常' }); return; }
    const isWb = isPublicLike(dir, finalName);
    // DG-SEC-001:白板归属落账 —— aid=本人有效 vid(覆盖判定与后台"归属"列都吃它),
    //   重保存保留原 mt(已分享出去的 URL 不断),新作品签发新 mt(与公开分支同形)
    if (!adminWrite && isWb) {
      if (!gateData.uploads) gateData.uploads = {};
      const aid = authVid(req);
      const prev = gateData.uploads[finalName];
      gateData.uploads[finalName] = (prev && prev.aid === aid)
        ? Object.assign({}, prev, { dk: deviceKey(req), aid, ts: Date.now() })
        : { dk: deviceKey(req), aid, ts: Date.now(), mt: crypto.randomBytes(10).toString('hex') };
      try { saveGateData(); } catch (e) {}
    }
    // 2026-09-20 审计 M2:非 public 分支补齐公开路同款防线——
    //   ① 图片过 NSFW(白板是匿名公开展品,与照片同险);② 白板计入 abuse 限速(超限删文件+429)。
    if (isWb && st.size) {
      const verdict = await moderateImage(filePath);
      if (verdict === 'block') {
        try { fs.unlinkSync(filePath); } catch (e) {}
        if (gateData.uploads) delete gateData.uploads[finalName];
        if (!res.writableEnded) sendJson(res, 422, { error: '这片灵蕴暂时无法归位' });
        return;
      }
      // DG-UP-003 决策:只对公开展品 fail-closed。审核通道已开启却失败/超时/无响应 = 'unavailable'
      //   ⇒ 不自动上墙(记 uploads[name].pending,决策表 mediarules 据此同时挡墙面与下载);
      //   按数据保留铁律软处理:文件保留、绝不删,后台复核或下次上传通过即摘除标记。
      //   私人上传(自己看自己)维持原样:unavailable 仍按放行处理。
      if (verdict === 'unavailable') {
        const { ownerAid } = require('./store');
        if (!gateData.uploads) gateData.uploads = {};
        const ts = Date.now();
        const rec = gateData.uploads[finalName] || (gateData.uploads[finalName] = {
          dk: deviceKey(req), aid: adminWrite ? ownerAid(req) : authVid(req), ts, mt: crypto.randomBytes(10).toString('hex'),
        });
        rec.pending = ts;
        try { saveGateData(); } catch (e) {}
        if (!res.writableEnded) sendJson(res, 202, {
          ok: true, pending: true, name: finalName, url: `/${dir}/${encodeURIComponent(finalName)}`, size: st.size,
          status: 'pending-review', message: '作品已收到,审核通道暂不可用,复核通过后自动上墙',
        });
        return;
      }
      // 审核正常通过:摘掉历史 pending 标记(白板允许本人重保存,重画即重审)
      if (gateData.uploads && gateData.uploads[finalName] && gateData.uploads[finalName].pending) {
        delete gateData.uploads[finalName].pending;
        try { saveGateData(); } catch (e) {}
      }
    }
    if (isWb || /^whiteboard-/.test(finalName)) {
      const dk = deviceKey(req);
      let block = null;
      try { block = abuseMod.abuseCheck(dk, finalName, st.size); } catch (e) {}
      if (block && block !== 'storage') {
        try { fs.unlinkSync(filePath); } catch (e) {}
        if (gateData.uploads) delete gateData.uploads[finalName];
        try { saveGateData(); } catch (e) {}
        if (!res.writableEnded) sendJson(res, 429, { error: '上传太快啦，休息一下再来' });
        return;
      }
    }
    sendJson(res, 201, {
      ok: true, name: finalName, url: `/${dir}/${encodeURIComponent(finalName)}`, size: st.size,
      // 服务端签发口径回给前端:新作品 issued=true(前端据此把当前画绑定到这个名字,后续保存即覆盖自己)
      issued: !adminWrite && exclusiveNew ? true : undefined,
      overwritten: overwriteOwn || undefined,
    });
    // 服务端主动推送:新文件立即通知所有在线游戏页刷新(2026-08-29)
    try { mediaBroadcast({ dir, name: finalName }); } catch (e) {}
    // 自动镜像到 R2(白板/后台直传;压缩完成若替换会再同步一次)
    r2Mirror(dir, finalName, filePath);
    // 白板新作即时推送(替代访客端 5s 轮询,2026-07-25):SSE 通知所有在线页面刷新作品墙
    if (/^whiteboard-/.test(finalName)) { try { require('./gate').sseKick(); } catch (e) {} }
  });
  ws.on('error', () => { freeSlot(); if (!upTooBig) sendJson(res, 500, { error: '写入失败' }); });
}

// ===================== 分片上传(2026-07-28 晚高峰应急,主人定) =====================
// 背景:Cloudflare 边缘→源站回源带宽被运营商压到 ~12-40KB/s,>1MB 的上传撑满 100s 超时 → 524。
// 方案:前端按 256KB 切片逐片 POST(每片几秒内完成),服务端按序暂存 .chunks/,最后一片触发改名+同一后处理。
// POST /api/upload/chunk?dir=photos&name=x.jpg&seq=0&total=8 (body=单片字节,公开,规则与直传一致)
// DG-UP-002(2026-10-11)整改三件:
//   ① 残片 GC 周期化(此前唯一调用点在末片合并路径里 ⇒ 只发首片的攻击者永不触发清扫,残片无限占盘);
//   ② 在途配额(按 IP 记字节与并发上传数 + 全局并发上限)——残片不进 gateData.uploads,
//      lib/abuse.js 的设备累计统计看不见它们,必须本模块自己记账;
//   ③ 体积上限前移(首片按声明片数判"不可能更小"的下限即拒,每片再按累计实字节即时拒,
//      不再只在末片算总账:4000 片只为一张图也能一路写满 1.5GB 才报 413)。
const CHUNK_DIR = process.env.CHUNK_DIR || path.join(ROOT, '.chunks'); // 点目录,静态黑名单天然拦截公网(可重定向给测试/运维)
const CHUNK_MAX_BYTES = 400 * 1024;               // 单片硬上限(前端按 256KB 切)
const CHUNK_NOMINAL_BYTES = 256 * 1024;           // 客户端标称片长(src/gate/upload-rules.mjs CHUNK_SIZE)
const CHUNK_STALE_MS = 24 * 3600 * 1000;          // 超过 24h 的残片视为废弃(AGENTS.md 既有口径)
const CHUNK_GC_INTERVAL_MS = 3600 * 1000;         // 每小时扫一次
const CHUNK_MAX_PARTS = 4000;                     // 片数上限(既有口径)
// 在途配额:超限 503(容量保护,不是行为惩罚 —— 残片占满磁盘后连正常上传都写不进去)
const INFLIGHT_BYTES_PER_IP = 2 * 1024 * 1024 * 1024;
const INFLIGHT_MAX_UPLOADS_PER_IP = 8;
const INFLIGHT_MAX_UPLOADS = 200;

const inflightIp = new Map();   // ip -> { bytes, uploads }
const chunkLedger = new Map();  // 'ip|ownerKey|dir|name' -> { ip, bytes, ts }
const chunkGcCount = { sweeps: 0, removed: 0 };

function ipOf(req) {
  try { return require('./store').realIP(req) || 'unknown'; } catch (e) { return 'unknown'; }
}
function ledgerId(ip, ownerKey, dir, name) { return ip + '|' + ownerKey + '|' + dir + '|' + name; }
function globalInflightUploads() {
  let n = 0;
  for (const v of inflightIp.values()) n += v.uploads;
  return n;
}
function inflightStats() {
  let bytes = 0, uploads = 0;
  for (const v of inflightIp.values()) { bytes += v.bytes; uploads += v.uploads; }
  return { bytes, uploads, ips: inflightIp.size, tracked: chunkLedger.size, sweeps: chunkGcCount.sweeps, removed: chunkGcCount.removed };
}
// 首片准入:返回 null=放行,否则为拒绝原因(perip/global/bytes)
function beginInflight(ip, id, projectedBytes) {
  const cur = inflightIp.get(ip) || { bytes: 0, uploads: 0 };
  if (cur.uploads >= INFLIGHT_MAX_UPLOADS_PER_IP) return 'perip';
  if (globalInflightUploads() >= INFLIGHT_MAX_UPLOADS) return 'global';
  if (cur.bytes + Math.max(0, projectedBytes) > INFLIGHT_BYTES_PER_IP) return 'bytes';
  inflightIp.set(ip, cur);
  chunkLedger.set(id, { ip, bytes: 0, ts: Date.now() });
  cur.uploads += 1;
  return null;
}
function addInflightBytes(ip, id, n) {
  const led = chunkLedger.get(id);
  if (!led) return;
  led.bytes += n;
  led.ts = Date.now();
  const cur = inflightIp.get(ip);
  if (cur) cur.bytes = Math.max(0, cur.bytes + n);
}
function releaseInflight(id) {
  const led = chunkLedger.get(id);
  if (!led) return;
  chunkLedger.delete(id);
  const cur = inflightIp.get(led.ip);
  if (cur) {
    cur.bytes = Math.max(0, cur.bytes - led.bytes);
    cur.uploads = Math.max(0, cur.uploads - 1);
    if (!cur.uploads && !cur.bytes) inflightIp.delete(led.ip);
  }
}
// 清掉本次上传已落的全部分片(拒绝/失败路径),被拒的残片不许继续占盘
function dropChunks(ownerKey, name) {
  const prefix = ownerKey + '-' + name + '.';
  try {
    for (const f of fs.readdirSync(CHUNK_DIR)) if (f.startsWith(prefix)) { try { fs.unlinkSync(path.join(CHUNK_DIR, f)); } catch (e) {} }
  } catch (e) {}
}
// 24h 龄期清扫:删过期残片 + 释放其记账(账本按最后活动时间过期,与文件同口径)
function sweepStaleChunks(now) {
  const t0 = now || Date.now();
  chunkGcCount.sweeps++;
  try {
    for (const f of fs.readdirSync(CHUNK_DIR)) {
      try {
        const p = path.join(CHUNK_DIR, f);
        if (t0 - fs.statSync(p).mtimeMs > CHUNK_STALE_MS) { fs.unlinkSync(p); chunkGcCount.removed++; }
      } catch (e) {}
    }
  } catch (e) {}
  for (const [id, led] of chunkLedger) {
    if (t0 - led.ts > CHUNK_STALE_MS) releaseInflight(id);
  }
  return chunkGcCount.removed;
}
let chunkGcTimer = null;
// 周期 GC:句柄可清(stopChunkGc 供测试与关停用);unref 保证定时器永不拖住进程退出
function startChunkGc() {
  if (chunkGcTimer) return false;
  chunkGcTimer = setInterval(() => { try { sweepStaleChunks(); } catch (e) {} }, CHUNK_GC_INTERVAL_MS);
  if (chunkGcTimer.unref) chunkGcTimer.unref();
  return true;
}
function stopChunkGc() {
  if (!chunkGcTimer) return false;
  clearInterval(chunkGcTimer);
  chunkGcTimer = null;
  return true;
}
function chunkGcOn() { return !!chunkGcTimer; }
sweepStaleChunks();      // 模块加载即清一次(此前残片要等"有人完成一次末片合并"才被扫)
startChunkGc();
// 测试钩子:清内存记账(不动磁盘),让用例之间互不牵连
function _resetChunkState() {
  inflightIp.clear();
  chunkLedger.clear();
  chunkGcCount.sweeps = 0;
  chunkGcCount.removed = 0;
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
  if (!Number.isInteger(seq) || !Number.isInteger(total) || seq < 0 || total < 1 || seq >= total || total > CHUNK_MAX_PARTS) { sendJson(res, 400, { error: '分片序号不合法' }); return; }
  const cl = parseInt(req.headers['content-length'] || '0', 10);
  if (cl > CHUNK_MAX_BYTES) { sendJson(res, 413, { error: '分片过大' }); return; }
  // 体积上限前移:按声明片数算"不可能更小"的下限,首片即拒(实切 256KB,故不用 total×400KB 上限判定 ——
  //   那会把 2800 片的合法 700MB 视频误杀在 1.12GB 上;超出下限的部分由每片累计实字节检查即时兜住)
  const declaredMinBytes = (total - 1) * CHUNK_NOMINAL_BYTES + 1;
  if (declaredMinBytes > maxBytes) { sendJson(res, 413, { error: '分片总数超出体积上限(声明体积约 ' + Math.round(declaredMinBytes / 1024 / 1024) + 'MB)' }); return; }
  const finalPath = path.join(ROOT, dir, name);
  try { fs.mkdirSync(CHUNK_DIR, { recursive: true }); } catch (e) {}
  // 2026-08-31 审计 M5:.part 掺上传者设备键,防攻击者为他人正在上传的 name 投毒分片
  const ownerKey = require('./store').deviceKey(req).slice(0, 12);
  const ip = ipOf(req);
  const id = ledgerId(ip, ownerKey, dir, name);
  // 公开上传禁止覆盖(与直传同规)
  // DG-UP-002:这条路也要还账 —— 名字被抢走后本上传的分片永远合不上了,留着白占额度与磁盘
  if (fs.existsSync(finalPath)) {
    if (chunkLedger.has(id)) { dropChunks(ownerKey, name); releaseInflight(id); }
    sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' });
    return;
  }
  if (!chunkLedger.has(id)) {
    // DG-SEC-005:分片通道同样过「目标盘水位 + 媒体总预算」闸(按声明体积预约,首片即判)。
    //   在途写盘名额只在末片真合并那一刻占 —— 分片传输可以拖很久,不该把 4 个名额占满全场
    const probe = require('./abuse').reserveUploadSlot('public', declaredMinBytes, path.join(ROOT, dir));
    if (!probe.allow) { sendCapacityReject(res, probe); return; }
    try { probe.done(); } catch (e) {}
    // 在途配额只在"该上传尚无账本条目"时准入判定(首片,或进程重启后的续传片);
    // 已有条目的续片直接放行,否则正常续传会被自己占的额度卡死
    const quota = beginInflight(ip, id, declaredMinBytes);
    if (quota) { sendJson(res, 503, { error: '服务器暂存区繁忙(在途分片配额已满),请稍后重传', quota }); return; }
  }
  const partPath = path.join(CHUNK_DIR, ownerKey + '-' + name + '.' + seq + '.part'); // isValidName 已挡斜杠,name 必为纯文件名
  let bytes = 0, tooBig = false;
  const ws = fs.createWriteStream(partPath);
  // 即时中止本上传:摘掉本片 + 同上传已落分片 + 释放记账(残片不留)
  const abortChunk = (code, msg) => {
    tooBig = true;
    try { ws.destroy(); } catch (e) {}
    fs.unlink(partPath, () => {});
    dropChunks(ownerKey, name);
    releaseInflight(id);
    sendJson(res, code, { error: msg });
    try { req.destroy(); } catch (e) {}
  };
  req.on('data', c => {
    bytes += c.length;
    if (bytes > CHUNK_MAX_BYTES && !tooBig) abortChunk(413, '分片过大');
  });
  req.pipe(ws);
  ws.on('finish', async () => {
    if (tooBig) return;
    addInflightBytes(ip, id, bytes);
    // 每片即时体积闸(此前总量只在末片检查一次)
    const led = chunkLedger.get(id);
    const acc = led ? led.bytes : 0;
    if (acc > maxBytes) { abortChunk(413, isVid ? '视频不能超过 700MB' : '图片不能超过 50MB'); return; }
    let preBlock = null;
    try { preBlock = require('./abuse').abuseSizePrecheck(ownerKey, name, acc); } catch (e) {}
    if (preBlock === 'bigfile') { abortChunk(429, '上传过于频繁或超出设备配额，请稍后再试'); return; }
    if (seq < total - 1) { sendJson(res, 200, { ok: true, seq }); return; }
    // 最后一片:校验齐全 → 组装 → 清残片 → 与直传同一后处理
    let merged = false;
    let createdTarget = false; // 'wx' 之后失败要把自己建的半成品摘掉,不许留幽灵文件
    let mergeSlot = null, mergeReject = null; // DG-SEC-005:合并写盘那一刻才占在途名额
    try {
      // 流式拼接(2026-07-31):避免 Buffer.concat 全量读入内存导致 OOM
      let totalSize = 0;
      for (let i = 0; i < total; i++) {
        const p = path.join(CHUNK_DIR, ownerKey + '-' + name + '.' + i + '.part');
        if (!fs.existsSync(p)) throw new Error('缺第 ' + (i + 1) + ' 片');
        totalSize += fs.statSync(p).size;
      }
      if (totalSize > maxBytes) throw Object.assign(new Error(isVid ? '视频不能超过 700MB' : '图片不能超过 50MB'), { httpCode: 413 });
      // DG-SEC-005 在途写盘硬闸:合并 = 这条路上真正落盘的一刻。被拒时分片原样保留,
      //   客户端按 Retry-After 重发末片就能续上(不 dropChunks、不还额度,免得合法上传被自己挤死)
      mergeSlot = require('./abuse').reserveUploadSlot('public', totalSize, path.join(ROOT, dir));
      if (!mergeSlot.allow) { mergeReject = mergeSlot; mergeSlot = null; throw Object.assign(new Error('存储容量或写入并发已达上限，请稍后再试'), { capacity: true }); }
      // 组装输出用 'wx' 独占创建拿 fd:分片期间别人抢先落了同名文件 ⇒ EEXIST ⇒ 409
      //   (与直传同规;不再靠"existsSync 查两次"兜竞态窗口)
      let ffd;
      try { ffd = fs.openSync(finalPath, 'wx'); }
      catch (e) { if (e && e.code === 'EEXIST') throw Object.assign(new Error('同名文件已存在，请改名后再上传'), { httpCode: 409 }); throw e; }
      createdTarget = true;
      const mws = fs.createWriteStream(finalPath, { fd: ffd });
      for (let i = 0; i < total; i++) {
        const p = path.join(CHUNK_DIR, ownerKey + '-' + name + '.' + i + '.part');
        await new Promise((ok, fail) => { const rs = fs.createReadStream(p); rs.pipe(mws, { end: false }); rs.on('end', ok); rs.on('error', fail); });
      }
      mws.end();
      await new Promise(ok => mws.on('finish', ok));
      merged = true;
      for (let i = 0; i < total; i++) fs.unlinkSync(path.join(CHUNK_DIR, ownerKey + '-' + name + '.' + i + '.part'));
    } catch (e) {
      if (createdTarget && !merged) { try { fs.unlinkSync(finalPath); } catch (e3) {} } // 半成品不留,否则该名字被幽灵文件占死
      if (e && e.capacity) sendCapacityReject(res, mergeReject);
      else if (e && e.httpCode) sendJson(res, e.httpCode, { error: e.message });
      else sendJson(res, 409, { error: '分片不完整，请重传：' + (e.message || '未知错误') });
    } finally {
      if (mergeSlot) { try { mergeSlot.done(); } catch (e) {} } // 合并成功/失败/断连都还位(done 幂等)
      releaseInflight(id); // 合并成功/失败/拒绝一律释放记账
    }
    if (!merged) return;
    // C8 NSFW 审核(图片):组装完成后过 vision 双通道,违规即删+拒传
    if (isImg) {
      const verdict = await moderateImage(finalPath);
      if (verdict === 'block') {
        try { fs.unlink(finalPath, () => {}); } catch (e2) {}
        if (!res.writableEnded) sendJson(res, 422, { error: '这片灵蕴暂时无法归位' });
        return;
      }
      // 'unavailable'=审核不可用:分片通道是访客本人私有展品,维持放行(fail-closed 只用于匿名公开展品)
    }
    const { gateData, saveGateData, deviceKey } = require('./store');
    if (!gateData.uploads) gateData.uploads = {};
    const dk = deviceKey(req);
    const aid = require('./store').ownerAid(req); // vid 优先(与直传同规)
    const st = fs.statSync(finalPath);
    gateData.uploads[name] = { dk, aid, ts: Date.now(), mt: require('crypto').randomBytes(10).toString('hex') };
    let abuseBlock = null;
    try { abuseBlock = require('./abuse').abuseCheck(dk, name, st.size); } catch (e) {}
    if (abuseBlock && abuseBlock !== 'storage') {
      try { fs.unlinkSync(finalPath); } catch (e) {}
      delete gateData.uploads[name];
      try { saveGateData(); } catch (e) {}
      sendJson(res, 429, { error: '上传过于频繁或超出设备配额，请稍后再试' });
      return;
    }
    saveGateData();
    sendJson(res, 201, { ok: true, name, url: `/${dir}/${encodeURIComponent(name)}`, size: st.size, mt: gateData.uploads[name].mt });
    try { mediaBroadcast({ dir, name }); } catch (e) {}
    r2Mirror(dir, name, finalPath);
    setImmediate(() => compressJob(dir, name));
  });
  ws.on('error', () => {
    if (tooBig) return;
    releaseInflight(id); // 写片失败也要还额度,否则账本只增不减
    sendJson(res, 500, { error: '写入失败' });
  });
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
      // 服务端主动推送:删除文件 → 在线游戏页立即移除(2026-08-29)
      try { mediaBroadcast({ dir, name }); } catch (e) {}
      // 自动从 R2 删除,保持镜像一致;失败进台账接着重试
      // (反向分歧也要自愈:源站已删而 R2 还留着 = 私有展品在 CDN 上仍可被命中)
      try { r2outbox.syncDelete(dir, name); } catch (e) { console.warn('[r2outbox] DELETE 记账失败:', e && e.message); }
    }
  });
}

// ===================== 后台异步压缩(省存储,不占上传速度) =====================
// 规则:上传完成响应后才开始;单任务队列(2 核服务器);nice 低优先级;
// 只有压缩后更小才替换;视频统一转 mp4 时同步迁移 uploads/photoCaptions 记录;
// 图片必须保持原扩展名(画框按原文件名引用,改名会 404 白框),bmp/tiff 同格式压不动直接跳过
const compressQueue = [];
let compressing = false;
let compressTmpSeq = 0; // 压缩临时名的进程内计数(与 pid 一起构成唯一后缀)
const VID_COMPRESS_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.3gp', '.mpg', '.mpeg'];
const IMG_COMPRESS_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

// 不覆盖式搬移:link 在目标已存在时必失败(EEXIST),把"查存在→搬移"的竞态窗口交给内核判
//   link 不可用(跨设备/文件系统限制)时退回 existsSync+rename,目标存在仍旧拒
function moveNoOverwrite(src, dst) {
  try { fs.linkSync(src, dst); fs.unlinkSync(src); return true; }
  catch (e) {
    if (e && e.code === 'EEXIST') return false;
    if (fs.existsSync(dst)) return false;
    try { fs.renameSync(src, dst); return true; } catch (e2) { return false; }
  }
}

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
    const dirRoot = path.join(ROOT, dir);
    const filePath = `${dirRoot}${path.sep}${name}`; // 与 join 等价(name/dir 为内部队列白名单值)
    if (!filePath.startsWith(dirRoot + path.sep)) return done(); // 压缩队列路径兜底
    const size0 = fs.statSync(filePath).size;
    const isVid = dir === 'videos' && VID_COMPRESS_EXT.includes(ext);
    const isImg = dir === 'photos' && IMG_COMPRESS_EXT.includes(ext);
    // 小文件不动:图片 <1MB、已是 mp4 且 <20MB
    if ((!isVid && !isImg) || (isImg && size0 < 1024 * 1024) || (isVid && ext === '.mp4' && size0 < 20 * 1024 * 1024)) return done();
    const base = name.slice(0, name.length - ext.length);
    // 图片保持原扩展名输出(永不改名);只有视频才会转 .mp4
    const outExt = isVid ? '.mp4' : ext;
    // 临时名带进程内唯一后缀:此前按 basename 派生 ⇒ 同 basename 的两个并发压缩会争抢同一个 tmp
    //   (队列是单工位,但改名后的重投/后台同名上传仍可能并行;争抢会把 A 的产物写成 B 的名字)
    const tmpPath = path.join(ROOT, dir, base + '.compressing.' + process.pid + '.' + (++compressTmpSeq) + outExt);
    const args = isVid
      ? ['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '800k', '-maxrate', '1000k', '-bufsize', '2000k', '-vf', "scale='min(1280,iw)':-2", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmpPath]
      : (ext === '.png'
        ? ['-y', '-i', filePath, '-vf', "scale='min(1920,iw)':-2", '-compression_level', '9', tmpPath]
        : ['-y', '-i', filePath, '-vf', "scale='min(1920,iw)':-2", '-q:v', '3', tmpPath]);
    const p = spawnProc('nice', ['-n', '19', 'ffmpeg', ...args], { stdio: 'ignore' });
    p.on('error', done);
    p.on('close', code => {
      try {
        if (code === 0 && fs.existsSync(tmpPath)) {
          const size1 = fs.statSync(tmpPath).size;
          if (size1 < size0 * 0.92) {
            // 明显更小才替换
            const newName = base + outExt;
            const newPath = path.join(ROOT, dir, newName);
            const renaming = newName !== name; // 图片 outExt===ext ⇒ newName===name,只有视频改名
            // DG-FILE-001#1:改名前必须查目标 —— 上传阶段的 409 只查原始名(abc.mov 不存在即放行),
            //   于是上传 abc.mov 可在后处理覆盖已存在的 abc.mp4(画廊展品文件 + CDN 对象一起被换)。
            //   目标已存在 = 放弃改名:保留原文件与原归属,搬来的产物直接删,不做 uploads 迁移也不 PUT 新名。
            if (renaming && fs.existsSync(newPath)) {
              console.warn(`[upload] 压缩改名目标已存在,放弃改名(保留 ${name} / 不覆盖 ${newName})`);
              try { fs.unlinkSync(tmpPath); } catch (e) {}
              return done();
            }
            if (renaming && !moveNoOverwrite(tmpPath, newPath)) {
              // 上面 existsSync 与落盘之间的竞态:独占 link 失败说明目标刚被别人占 ⇒ 同样放弃改名
              console.warn(`[upload] 压缩改名被独占创建拒绝(目标刚出现),放弃改名: ${newName}`);
              try { fs.unlinkSync(tmpPath); } catch (e) {}
              return done();
            }
            if (!renaming) fs.renameSync(tmpPath, newPath); // 原地替换自己的文件,不涉及他人
            if (renaming) fs.unlink(filePath, () => {});
            const { gateData, saveGateData } = require('./store');
            let dirty = false;
            // DG-FILE-001#2:归属迁移只在"目标键不存在"时进行,并二次确认目标键未被他人占用 ——
            //   无条件搬键会把已存在的 abc.mp4 的 dk/aid/mt(所有权)一起搬走
            if (renaming && gateData.uploads && gateData.uploads[name] && !gateData.uploads[newName]) {
              gateData.uploads[newName] = gateData.uploads[name];
              delete gateData.uploads[name]; dirty = true;
            }
            if (renaming && gateData.photoCaptions && gateData.photoCaptions[name] && !gateData.photoCaptions[newName]) {
              gateData.photoCaptions[newName] = gateData.photoCaptions[name];
              delete gateData.photoCaptions[name]; dirty = true;
            }
            if (dirty) saveGateData();
            // 压缩版替换了服务器文件 → 重新镜像 R2,保证两边一致
            r2Mirror(dir, newName, newPath);
          } else {
            fs.unlink(tmpPath, () => {}); // 没省多少,保留原文件
          }
        }
      } catch (e) { /* 失败保原文件 */ }
      done();
    });
  } catch (e) { done(); }
}

// ===================== C8 NSFW 审核(2026-07-30;三态化 2026-10-11 DG-UP-003) =====================
// 图片上传完成后过 vision 双通道判定;开关由 NSFW_MODERATE=1 控制(默认关,不惊扰/不烧钱/测试确定性);
// 三态返回:
//   'allow'        = 判定安全,或审核开关未开(主人的成本策略,照旧放行)
//   'block'        = 判定违规(调用方删文件 + 422)
//   'unavailable'  = 审核已开启却拿不到结论(取样失败/AI 全通道失败/超时/空响应)
//                    ⇒ 调用方按展品公开性决定:匿名公开展品 fail-closed(挂 pending 不上墙),私人展品放行
// 开关按调用时读环境:运行期可关可开,单测也能确定性切换三态
function nsfwEnabled() { return process.env.NSFW_MODERATE === '1'; }
const NSFW_PROMPT = '你是内容安全审核员。判断图像是否包含色情、裸露、性暗示、血腥暴力或违法内容。只回复一个单词:若安全请回复 PASS,若违反请回复 BLOCK。不要输出任何其他文字或标点。';

// 送样前降采样到 ≤maxPx 的 JPEG(2026-10-11 DG-AI-001:整张原图直送 base64 是内存放大器
//   —— 50MB 照片 = 一次性 ~67MB 字符串 + JSON 体再翻倍;仓内早有 scale='min(512,iw)' 先例)
// 小文件不必起 ffmpeg / ffmpeg 缺失或失败 → 回退原图字节;全程异步,不在事件循环上同步读盘
// 返回 { b64, via } via: 'scaled'|'raw'|'missing'|'error'(调用方据此判是否拿到可用样本)
const SAMPLE_INLINE_MAX = 256 * 1024;
async function imgB64Sample(filePath, maxPx) {
  const px = Number(maxPx) > 0 ? Number(maxPx) : 512;
  let size = 0;
  try { size = (await fs.promises.stat(filePath)).size; }
  catch (e) { return { b64: '', via: 'missing' }; }
  const raw = async () => {
    try { return { b64: (await fs.promises.readFile(filePath)).toString('base64'), via: 'raw' }; }
    catch (e) { return { b64: '', via: 'error' }; }
  };
  if (size <= SAMPLE_INLINE_MAX) return await raw();
  const tmp = path.join(os.tmpdir(), 'sample-' + crypto.randomBytes(6).toString('hex') + '.jpg');
  return await new Promise(resolve => {
    let settled = false;
    const fin = async useTmp => {
      if (settled) return;
      settled = true;
      let out;
      try {
        const buf = await fs.promises.readFile(useTmp ? tmp : filePath);
        out = { b64: buf.toString('base64'), via: useTmp ? 'scaled' : 'raw' };
      } catch (e) { out = { b64: '', via: 'error' }; }
      fs.unlink(tmp, () => {});
      resolve(out);
    };
    let p;
    try {
      p = spawnProc('ffmpeg', ['-y', '-i', filePath, '-vf', `scale='min(${px},iw)':-2`, '-q:v', '5', tmp], { stdio: 'ignore' });
    } catch (e) { return fin(false); }
    p.on('error', () => fin(false));
    p.on('close', code => fin(code === 0 && fs.existsSync(tmp)));
  });
}

async function moderateImage(filePath) {
  if (!nsfwEnabled()) return 'allow';
  let sample;
  try { sample = await imgB64Sample(filePath, 512); } catch (e) { return 'unavailable'; }
  if (!sample || !sample.b64) return 'unavailable';
  try {
    const r = await chatVision({ text: NSFW_PROMPT, imageB64: sample.b64, maxTokens: 8, timeoutMs: 25000 });
    if (!r || !r.text) return 'unavailable';
    return /BLOCK/.test(r.text.toUpperCase()) ? 'block' : 'allow';
  } catch (e) { return 'unavailable'; }
}

// ===================== 本人上传清单(2026-07-30 C2:展厅选片导入) =====================
// GET /api/myuploads:返回本人上传的照片/视频名,供选片界面列出
// 归属判定与媒体门禁共用 siteconfig.isMineUpload 单一口径(DG-SEC-001/002):只认本人有效 vid。
//   原先的 `rec.dk !== dk && rec.aid !== aid` 是 OR 语义——同 UA 的陌生访客能把别人的文件名列进自己清单。
function handleMyUploads(req, res, query) {
  const { gateData, deviceKey } = require('./store');
  const { isMineUpload } = require('./siteconfig');
  const dk = deviceKey(req);
  const names = Object.keys(gateData.uploads || {})
    .filter(n => {
      const rec = gateData.uploads[n];
      if (!rec || !isMineUpload(req, rec, dk)) return false;
      const ext = path.extname(n).toLowerCase();
      return PUBLIC_IMG_EXT.includes(ext) || PUBLIC_VID_EXT.includes(ext);
    })
    .sort();
  sendJson(res, 200, { names });
}

module.exports = {
  handleList, handleUpload, handleUploadChunk, handleDelete, handleMyUploads,
  // 新增能力(2026-10-11 安全整改):既有导出名与签名一字未动
  sweepStaleChunks, startChunkGc, stopChunkGc, chunkGcOn, inflightStats,
  moderateImage, imgB64Sample, nsfwEnabled,
  r2Mirror, r2HealMedia, r2PendingMedia,
  CHUNK_MAX_BYTES, CHUNK_NOMINAL_BYTES, CHUNK_STALE_MS, CHUNK_GC_INTERVAL_MS,
  INFLIGHT_BYTES_PER_IP, INFLIGHT_MAX_UPLOADS_PER_IP, INFLIGHT_MAX_UPLOADS,
  _resetChunkState,
  // 2026-10-12 DG-SEC-001:白板作品名的唯一签发处(单测据此校验名字形态与 guard 对齐)
  newWhiteboardName, isPublicLike,
};
