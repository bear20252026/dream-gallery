// files-upload.js — 媒体写路径的**编排层**:列表/直传/分片/删除/本人清单(2026-09-18 自 files.js 拆分,审计 P3b;
// 2026-10-12 审计挂账 R2 第一步把流水线抽进 lib/upload/*,本文件退化为"读参数 → 调模块 → 按结论回响应")
// 静态读取见 files-static.js。
//
// 分工(改上传先按这张表找地方,别在本文件里再加一段管道):
//   lib/upload/magic.js     扩展名白名单 + 各入口体积上限 + 拒答文案(单一出处;本仓库无魔数嗅探,见该文件头注)
//   lib/upload/names.js     服务端签发名、白板目录/归属/覆盖闸门(401 与 409 的分野)、独占创建与撞名换名
//   lib/upload/quota.js     abuse.reserveUploadSlot 的四种 slotKind 与幂等还位 + 503/Retry-After 出口
//   lib/upload/stream.js    四件套:Content-Length 预检 / 流式计数 / 超限 destroy / 失败 unlink(四条入口共用)
//   lib/upload/chunks.js    分片暂存账本(每 IP 字节与条数、全局条数)、24h 残片 GC、末片合并
//   lib/upload/moderate.js  NSFW 三态裁决 + 送样降采样
//   lib/upload/transcode.js 后台压缩队列 + 不覆盖式改名
//   lib/upload/publish.js   落名后的公共尾巴:归属记录、反刷、响应、广播/R2 镜像/压缩/SSE 推送
//
// 留在本文件的两件事:① R2 镜像的三个门面(r2Mirror/r2HealMedia/r2PendingMedia)—— 进程内待补推集合
//   与持久台账 lib/r2outbox 的接线处,lib-r2-outbox.test.js 钉着"镜像与删除必须经台账";
//   ② 各 handler 的参数校验与状态码回写(外部契约)。
const fs = require('fs');
const path = require('path');
const { ROOT, MEDIA_DIRS, TOKEN } = require('./config');
const { sendJson, safeJoin, isValidName } = require('./util');
const { mediaBroadcast } = require('./media-push'); // 增删文件后推送游戏端即时刷新(2026-08-29)
// 媒体镜像统一走 r2outbox(2026-10-11 DG-R2-003):先落**持久待发台账**再 fire-and-forget ——
// 成功即出账,失败由台账按退避接着重试(进程重启也接得上);r2sync 不再由本文件直连
const r2outbox = require('./r2outbox');
const magic = require('./upload/magic');
const { isPublicLike, newWhiteboardName, decideAnonWhiteboard, openWriteTarget } = require('./upload/names');
const quota = require('./upload/quota');
const stream = require('./upload/stream');
const chunks = require('./upload/chunks');
const publish = require('./upload/publish');
const { moderateImage, imgB64Sample, nsfwEnabled } = require('./upload/moderate');

// GET /api/files?dir=photos|videos|music
// 2026-07-26 媒体门禁:无 token 时按 canServeMedia 过滤(普通用户只见演示/白板/大屏/本人上传;后台带 token 见全量)
// 可见性判定只有 siteconfig.canServeMedia 一处,而它吃 src/shared/mediarules.mjs 那张决策表 ——
// 本文件(以及 lib/upload/*)不许再写第二处可见性判断。
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

// POST /api/upload?dir=photos&name=xxx.jpg
// 公开上传规则(2026-07-25 主人定):任何人可传照片/视频,无需后台同意、不限张数——
//   图片 ≤50MB / 视频 ≤700MB / gateData.uploads 记录归属
//   普通用户互相看不到对方上传的图/视频,只有后台可见(可下载/查看/编辑)
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
    handlePublicUpload(req, res, dir, name);
    return;
  }
  handleWhiteboardOrAdminUpload(req, res, query, dir, name);
}

// ---- 入口 1:访客公开直传(路由 /api/upload auth:'public' + dir=photos|videos guard) ----
function handlePublicUpload(req, res, dir, name) {
  const kind = magic.uploadKind(dir, name);
  if (!kind.allowed) { sendJson(res, 400, { error: magic.PUBLIC_FORMAT_ERROR }); return; }
  const maxBytes = kind.maxBytes;
  const cl = stream.contentLength(req);
  if (cl > maxBytes) { sendJson(res, 413, { error: kind.tooBigMessage }); return; }
  const { gateData, deviceKey } = require('./store');
  // DG-UP-003:反刷的 BIGFILE(300MB)判定前移到 Content-Length 阶段——原先要整份写盘后才发现,
  //   等于允许攻击者每次刷满 300~700MB 的真实 I/O;设备累计与速率仍在写完后判(需要落盘尺寸/记录)。
  if (cl > 0 && quota.sizePrecheck(deviceKey(req), name, cl) === 'bigfile') {
    sendJson(res, 429, { error: '单文件超过 300MB 上限，请压小后再上传' });
    return;
  }
  const filePath = path.join(ROOT, dir, name);
  // DG-SEC-005 写盘前硬闸:目标盘剩余低于水位 / 媒体总量+在途预留超预算 / 同时在写的人太多 ⇒ 503。
  //   预约体积用 Content-Length(没带就按典型照片体积兜底),绝不给匿名请求开"零体积"的空头。
  const slot = quota.reserve('public', cl, path.join(ROOT, dir));
  if (!slot.allow) { quota.reject(res, slot); return; }
  // 公开上传禁止覆盖已存在文件(2026-07-26):否则任何人可用同名文件替换画廊展品。
  // DG-FILE-001#3:'wx' 独占创建把"查存在→开写"两步并成一个原子动作,堵掉并发同名竞态
  //   (原 existsSync 与 createWriteStream 之间两个请求可同时通过检查,后完成者覆盖前者)。
  //   注意这一支撞名就是 409,**不换名**(换名是白板那一支的服务端签发语义)
  let fd;
  try { fd = fs.openSync(filePath, 'wx'); }
  catch (e) {
    slot.release();
    if (e && e.code === 'EEXIST') { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
    sendJson(res, 500, { error: '写入失败' });
    return;
  }
  if (!gateData.uploads) gateData.uploads = {};
  const ws = fs.createWriteStream(filePath, { fd });
  stream.guard(req, ws, {
    maxBytes,
    filePath,
    overflow: { code: 413, message: kind.tooBigMessage },
    release: slot.release,
    disconnect: true, // 客户端断连也是"结束路径":还位在账(幂等)
    respond: (code, message) => sendJson(res, code, { error: message }),
    onFinish: async () => { await publish.publishAnonUpload(req, res, { dir, name, filePath, isImg: kind.isImg, r2Mirror }); },
    onError: (st) => { if (!st.over()) sendJson(res, 500, { error: '写入失败' }); },
  });
}

// ---- 入口 2:非公开分支 —— 白板(匿名)+ 后台 token 直传 ----
// DG-SEC-001(2026-10-12)的规矩(判定全在 lib/upload/names.js,这里只按结论回响应):
//   ① 新作品名字由服务端签发 + 'wx' 独占创建(匿名侧再也落不到自己挑的名字上);
//   ② 覆盖只允许"服务端签发给本人"的既有作品(gateData.uploads[name].aid === authVid(req));
//   ③ 判定全部在打开文件之前 ⇒ 不属于自己的一律 409,原文件一个字节都不动;
//   ④ 后台 token 直传(auth:'write')语义一字不改:自己挑名字、允许覆盖(主人要改要换画照旧)。
function handleWhiteboardOrAdminUpload(req, res, query, dir, name) {
  const { gateData } = require('./store');
  const { isLocalRequest } = require('./local-request'); // 叶子实现(security 也从这里转出)
  let adminWrite = false;
  try { adminWrite = require('./admin').tokenOk(req, query); } catch (e) { adminWrite = false; }
  // 未配置 TOKEN 时的本地写权 = 路由 auth:'write' 的同款判据(同一台机器口径,别再信 Host 头)
  if (!adminWrite && !TOKEN) adminWrite = isLocalRequest(req);

  const dirPath = path.join(ROOT, dir);
  let finalName = name;
  let overwriteOwn = false;  // 白板:本人既有作品的合法重保存(允许截断,这正是白板的产品行为)
  let exclusiveNew = false;  // 白板:新作品(独占创建,同名双请求只有一个能建成)

  if (!adminWrite) {
    // 匿名侧只剩白板这一条路,目录一起钉死为 photos 的 whiteboard-*(lib/upload/names.js)
    const d = decideAnonWhiteboard(req, gateData, dir, name, path.join(dirPath, name));
    if (d.verdict === 'reject') { sendJson(res, d.code, { error: d.error }); return; }
    if (d.verdict === 'overwrite') overwriteOwn = true;
    else { finalName = d.name; exclusiveNew = true; }
  }

  // 大小上限(2026-08-31 审计 H4):非 public 分支原先无任何上限,单请求可写满磁盘。
  // 与 public 同规:videos 700MB / photos 50MB(白板扩展名已在路由 guard 限死为图片)
  const maxBytes = magic.maxBytesForDir(dir);
  // DG-SEC-005 写盘前硬闸(与公开分支同一套数):后台 token 一律放行,只记在途账
  const slot = quota.reserve(adminWrite ? 'admin' : 'whiteboard', stream.contentLength(req), dirPath);
  if (!slot.allow) { quota.reject(res, slot); return; }

  const opened = openWriteTarget(dirPath, finalName, exclusiveNew);
  finalName = opened.finalName;
  const filePath = opened.filePath;
  if (opened.fd === null) {
    slot.release();
    if (opened.error && opened.error.code === 'EEXIST') { sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' }); return; }
    sendJson(res, 500, { error: '写入失败' });
    return;
  }
  const ws = fs.createWriteStream(filePath, { fd: opened.fd });
  stream.guard(req, ws, {
    maxBytes,
    filePath,
    overflow: { code: 413, message: magic.dirTooBigMessage(dir) },
    release: slot.release,
    disconnect: true, // 客户端断连也是"结束路径":还位在账(幂等;真漏了由 abuse.js 的 5 分钟兜底闸回收)
    respond: (code, message) => sendJson(res, code, { error: message }),
    onFinish: async () => {
      await publish.publishWhiteboardSave(req, res, {
        dir, finalName, filePath, adminWrite, exclusiveNew, overwriteOwn, r2Mirror,
      });
    },
    onError: (st) => { if (!st.over()) sendJson(res, 500, { error: '写入失败' }); },
  });
}

// ===================== 分片上传(2026-07-28 晚高峰应急,主人定) =====================
// POST /api/upload/chunk?dir=photos&name=x.jpg&seq=0&total=8 (body=单片字节,公开,规则与直传一致)
// 账本/残片 GC/末片合并在 lib/upload/chunks.js,这里只做参数校验、配额准入与回响应。
function handleUploadChunk(req, res, query) {
  const dir = query.dir, name = String(query.name || '');
  const seq = parseInt(query.seq, 10), total = parseInt(query.total, 10);
  if (!MEDIA_DIRS.includes(dir)) { sendJson(res, 400, { error: 'dir 必须是: ' + MEDIA_DIRS.join(', ') }); return; }
  if (!isValidName(name)) { sendJson(res, 400, { error: '文件名不合法' }); return; }
  const kind = magic.uploadKind(dir, name);
  if (!kind.allowed) { sendJson(res, 400, { error: magic.PUBLIC_FORMAT_ERROR }); return; }
  const maxBytes = kind.maxBytes;
  if (!Number.isInteger(seq) || !Number.isInteger(total) || seq < 0 || total < 1 || seq >= total || total > chunks.CHUNK_MAX_PARTS) { sendJson(res, 400, { error: '分片序号不合法' }); return; }
  const cl = stream.contentLength(req);
  if (cl > chunks.CHUNK_MAX_BYTES) { sendJson(res, 413, { error: '分片过大' }); return; }
  // 体积上限前移:按声明片数算"不可能更小"的下限,首片即拒(实切 256KB,故不用 total×400KB 上限判定 ——
  //   那会把 2800 片的合法 700MB 视频误杀在 1.12GB 上;超出下限的部分由每片累计实字节检查即时兜住)
  const declaredMinBytes = (total - 1) * chunks.CHUNK_NOMINAL_BYTES + 1;
  if (declaredMinBytes > maxBytes) { sendJson(res, 413, { error: '分片总数超出体积上限(声明体积约 ' + Math.round(declaredMinBytes / 1024 / 1024) + 'MB)' }); return; }
  const dirPath = path.join(ROOT, dir);
  const finalPath = path.join(dirPath, name);
  try { fs.mkdirSync(chunks.CHUNK_DIR, { recursive: true }); } catch (e) {}
  // 2026-08-31 审计 M5:.part 掺上传者设备键,防攻击者为他人正在上传的 name 投毒分片
  const ownerKey = require('./store').deviceKey(req).slice(0, 12);
  const ip = chunks.ipOf(req);
  const id = chunks.ledgerId(ip, ownerKey, dir, name);
  // 公开上传禁止覆盖(与直传同规)
  // DG-UP-002:这条路也要还账 —— 名字被抢走后本上传的分片永远合不上了,留着白占额度与磁盘
  if (fs.existsSync(finalPath)) {
    if (chunks.hasLedger(id)) { chunks.dropChunks(ownerKey, name); chunks.releaseInflight(id); }
    sendJson(res, 409, { error: '同名文件已存在，请改名后再上传' });
    return;
  }
  if (!chunks.hasLedger(id)) {
    // DG-SEC-005:分片通道同样过「目标盘水位 + 媒体总预算」闸(按声明体积预约,首片即判)。
    //   在途写盘名额只在末片真合并那一刻占 —— 分片传输可以拖很久,不该把 4 个名额占满全场
    const probe = quota.probe('public', declaredMinBytes, dirPath);
    if (!probe.allow) { quota.reject(res, probe); return; }
    // 在途配额只在"该上传尚无账本条目"时准入判定(首片,或进程重启后的续传片);
    // 已有条目的续片直接放行,否则正常续传会被自己占的额度卡死
    const q = chunks.beginInflight(ip, id, declaredMinBytes);
    if (q) { sendJson(res, 503, { error: '服务器暂存区繁忙(在途分片配额已满),请稍后重传', quota: q }); return; }
  }
  const partPath = chunks.partPath(ownerKey, name, seq);
  const ws = fs.createWriteStream(partPath);
  // 即时中止本上传:destroy 本片 + unlink + 摘掉同上传已落分片 + 释放记账(残片不留)
  stream.guard(req, ws, {
    maxBytes: chunks.CHUNK_MAX_BYTES,
    filePath: partPath,
    overflow: { code: 413, message: '分片过大' },
    onAbort: () => { chunks.dropChunks(ownerKey, name); chunks.releaseInflight(id); },
    respond: (code, message) => sendJson(res, code, { error: message }),
    onFinish: async (st) => {
      chunks.addInflightBytes(ip, id, st.bytes());
      // 每片即时体积闸(此前总量只在末片检查一次)
      const acc = chunks.ledgerBytes(id);
      if (acc > maxBytes) { st.abort(413, kind.tooBigMessage); return; }
      if (quota.sizePrecheck(ownerKey, name, acc) === 'bigfile') { st.abort(429, '上传过于频繁或超出设备配额，请稍后再试'); return; }
      if (seq < total - 1) { sendJson(res, 200, { ok: true, seq }); return; }
      // 最后一片:校验齐全 → 组装 → 清残片 → 与直传同一后处理
      let merged = false;
      try {
        const out = await chunks.assemble({
          ownerKey, name, total, finalPath, dirPath, maxBytes,
          tooBigMessage: kind.tooBigMessage,
          reserveMerge: (bytes) => quota.reserve('public', bytes, dirPath),
        });
        merged = !!out.ok;
      } catch (e) {
        if (e && e.capacity) quota.reject(res, e.slot);
        else if (e && e.httpCode) sendJson(res, e.httpCode, { error: e.message });
        else sendJson(res, 409, { error: '分片不完整，请重传：' + (e.message || '未知错误') });
      } finally {
        chunks.releaseInflight(id); // 合并成功/失败/拒绝一律释放记账
      }
      if (!merged) return;
      // compress:false = 分片应急通道不进压缩队列(改造前口径,R2 搬动时刻意原样保留;理由见 publish.js)
      await publish.publishAnonUpload(req, res, { dir, name, filePath: finalPath, isImg: kind.isImg, r2Mirror, compress: false });
    },
    onError: (st) => {
      if (st.over()) return;
      chunks.releaseInflight(id); // 写片失败也要还额度,否则账本只增不减
      sendJson(res, 500, { error: '写入失败' });
    },
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
      return magic.PUBLIC_IMG_EXT.includes(ext) || magic.PUBLIC_VID_EXT.includes(ext);
    })
    .sort();
  sendJson(res, 200, { names });
}

module.exports = {
  handleList, handleUpload, handleUploadChunk, handleDelete, handleMyUploads,
  // 新增能力(2026-10-11 安全整改):既有导出名与签名一字未动(2026-10-12 R2 抽模块后仍原样转出)
  sweepStaleChunks: chunks.sweepStaleChunks, startChunkGc: chunks.startChunkGc, stopChunkGc: chunks.stopChunkGc,
  chunkGcOn: chunks.chunkGcOn, inflightStats: chunks.inflightStats, _resetChunkState: chunks._resetChunkState,
  moderateImage, imgB64Sample, nsfwEnabled,
  r2Mirror, r2HealMedia, r2PendingMedia,
  CHUNK_MAX_BYTES: chunks.CHUNK_MAX_BYTES, CHUNK_NOMINAL_BYTES: chunks.CHUNK_NOMINAL_BYTES,
  CHUNK_STALE_MS: chunks.CHUNK_STALE_MS, CHUNK_GC_INTERVAL_MS: chunks.CHUNK_GC_INTERVAL_MS,
  INFLIGHT_BYTES_PER_IP: chunks.INFLIGHT_BYTES_PER_IP, INFLIGHT_MAX_UPLOADS_PER_IP: chunks.INFLIGHT_MAX_UPLOADS_PER_IP,
  INFLIGHT_MAX_UPLOADS: chunks.INFLIGHT_MAX_UPLOADS,
  // 2026-10-12 DG-SEC-001:白板作品名的唯一签发处(单测据此校验名字形态与 guard 对齐)
  newWhiteboardName, isPublicLike,
};
