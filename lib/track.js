// track.js — 链接点击埋点:每一次点击都记录完整身份信息
// 记录字段(2026-07-25 主人定,越多越好):时间/昵称/IP/归属地/UA/品牌/电量网络/
//   设备指纹(屏幕/时区/语言/平台/核心/内存/触屏/canvas)/点击的链接/馆内坐标
// 记录全量保留;后台支持批量清理(POST /api/admin/clicks/clear)与导出(xlsx)
const crypto = require('crypto');
const zlib = require('zlib');
const store = require('./store'); // 命名空间引用:saveGateData 可被测试替换(写放大治理需要计数)
const { gateData, deviceKey, findByDevice, realIP } = store;
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');
const ratelimit = require('./ratelimit');
// 影子双写(R1 第 2 步):click_events / client_errors(gate 信道)两张表。
// 只在既有落库点旁边多写一份,**读路径一条没动**;失败静默(SHADOW_WRITE=0 可整体停用)。
const shadow = require('./shadow');

if (!gateData.linkClicks) gateData.linkClicks = [];

// POST /api/track/click {link, url, pos, fp}(公开,访客点击链接时由前端触发)
// fp 字段白名单裁剪(2026-08-31 审计 M10:客户端任意 JSON 原样入库 → 刷盘 DoS 面)
const fpWhitelist = ['scr','avail','tz','lang','langs','platform','cores','mem','touch','maxTouch','canvas'];
function clipFp(fp) {
  const out = {};
  for (const k of fpWhitelist) if (fp[k] !== undefined) out[k] = String(fp[k]).slice(0, 64);
  return out;
}

// ===================== 写放大治理(2026-10-11 DG-DOS-001) =====================
// 两道闸:
//  ① 限流复用 lib/ratelimit.js(按 store.realIP 的固定窗口,自带 MAX_KEYS=5000 防撑爆)。
//     选型说明:原注释宣称的「每 IP 5 秒一条」从未接线(死代码 trackRate 已删);
//     分钟粒度对「点外链」这种人工节奏足够宽(60 次/分,真人点不满),
//     换来的是与 tts/quiz/chat 同一套限流实现,不再维护第二份窗口逻辑。
//     超限**回 200 {ok:true,throttled:true}**:埋点不该向浏览器报错,
//     更不该让前端 fetch 失败重试形成第二波风暴。
//  ② 攒批落库:埋点不再「每次变更同步落盘」,而是内存攒 2 秒 / 20 条 flush 一次。
//     ⚠️ 这是项目「SQLite 为权威、每次变更同步落盘」口径下的**埋点专用豁免**:
//     点击记录丢掉最后 ≤2 秒不影响任何门禁/归属决策,而省掉的是整库 JSON.stringify
//     + SQLite 事务 + JSON 镜像写(攻击面:不断 push/trim/save 制造整库写放大)。
//     进程 SIGTERM 优雅关闭时 server.js 会调 flushTrack(),避免丢批。
const TRACK_RATE_LIMIT = 60;      // 每 IP 每分钟点击记录上限
const FLUSH_MS = 2000;            // 攒批时间窗
const FLUSH_BATCH = 20;           // 攒够这么多条立刻落库
const CLICK_CAP = 5000;           // linkClicks 总量上限(行为与整改前一致)
const ERR_CAP = 500;              // gateData.clientErrors 总量上限(下方 push 处即用此常量,值不变)
// ⚠️ 条数上限与时间维度**共存**(DG-PRIV-001):CLICK_CAP / ERR_CAP 不因保留期削弱;
//   超过保留期的点击与报错由 lib/retention.js 统一裁剪(每条记录都带 t,缺 t 的畸形条目跳过不删)。
//   保留期一次 sweep 只落一次盘,与本模块"埋点攒批落库"是两条独立链路,互不增加写盘次数。
let pendingClicks = [];
let flushTimer = null;

function flushTrack() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!pendingClicks.length) return 0;
  const batch = pendingClicks;
  pendingClicks = [];
  const arr = store.gateData.linkClicks;
  for (const rec of batch) arr.push(rec);
  if (arr.length > CLICK_CAP) arr.splice(0, arr.length - CLICK_CAP);
  shadow.clicks(batch); // 影子写:**一批一次**多行 insert(一个事务),不拆成每条一 insert——攒批语义照旧
  store.saveGateData();
  return batch.length;
}

function enqueueClick(rec) {
  pendingClicks.push(rec);
  if (pendingClicks.length >= FLUSH_BATCH) { flushTrack(); return; }
  if (!flushTimer) flushTimer = setTimeout(flushTrack, FLUSH_MS);
}

function handleTrackClick(req, res) {
  readBody(req, obj => {
    const rl = ratelimit.hit(req, 'track', TRACK_RATE_LIMIT);
    if (!rl.ok) { sendJson(res, 200, { ok: true, throttled: true }); return; }
    const dk = deviceKey(req);
    // 档案里的已知身份(昵称/品牌/历史指纹)
    const rec = findByDevice(req);
    const a = rec && rec.a;
    // 前端顺带补采的指纹:档案没有就存上
    if (a && obj.fp && typeof obj.fp === 'object' && !a.fph) {
      const stable = [obj.fp.scr, obj.fp.avail, obj.fp.tz, obj.fp.lang, obj.fp.langs, obj.fp.platform, obj.fp.cores, obj.fp.mem, obj.fp.touch, obj.fp.maxTouch, obj.fp.canvas].join('|');
      a.fph = crypto.createHash('sha256').update((req.socket.remoteAddress || '') + '|' + stable).digest('hex').slice(0, 16);
      a.fp = clipFp(obj.fp);
      store.saveGateData(); // 档案字段必须同步落盘(它是归属/身份数据,不是埋点)
    }
    const ip = req.socket.remoteAddress || '';
    enqueueClick({
      t: Date.now(),
      dk,
      name: a ? a.answer || '访客' : '访客',
      ip,
      geo: (gateData.geo && gateData.geo[ip]) || '',
      ua: req.headers['user-agent'] || '',
      brand: a ? a.brand || '' : '',
      dev: a && a.dev ? a.dev : {},
      fp: obj.fp && typeof obj.fp === 'object' ? clipFp(obj.fp) : (a && a.fp ? a.fp : {}),
      link: String(obj.link || '').slice(0, 40),
      url: String(obj.url || '').slice(0, 300),
      pos: obj.pos && typeof obj.pos === 'object' ? { x: +obj.pos.x || 0, y: +obj.pos.y || 0, z: +obj.pos.z || 0 } : null,
    });
    sendJson(res, 200, { ok: true });
  });
}

// POST /api/admin/clicks/clear(token):批量清理全部点击记录
function handleClicksClear(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  pendingClicks = []; // 在途批次一并作废,否则清完又被下一批填回来
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const n = gateData.linkClicks.length;
  gateData.linkClicks = [];
  shadow.clearClicks(); // 后台"清空点击记录"是**真删**:数组与表一起清,否则对账永远对不上
  store.saveGateData();
  sendJson(res, 200, { ok: true, cleared: n });
}

// ===================== 零依赖 xlsx 导出 =====================
// CRC32(优先用内置 zlib.crc32,没有则手算)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// 最小 ZIP(STORED 无压缩,够 Excel 用)
function zipStore(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nb = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6);
    head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nb.length, 26); head.writeUInt16LE(0, 28);
    parts.push(head, nb, data);
    central.push([nb, crc, data.length, offset]);
    offset += 30 + nb.length + data.length;
  }
  const cdParts = [];
  for (const [nb, crc, size, off] of central) {
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(size, 20); c.writeUInt32LE(size, 24);
    c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    cdParts.push(c, nb);
  }
  const cd = Buffer.concat(cdParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
function xlsxOf(sheets) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sheetXml = rows => rows.map((r, i) =>
    `<row r="${i + 1}">${r.map((c, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`).join('')}</row>`
  ).join('');
  const overrides = sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetTags = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const relTags = sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const files = [
    ['[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`)],
    ['_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')],
    ['xl/workbook.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`)],
    ['xl/_rels/workbook.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}</Relationships>`)],
  ];
  sheets.forEach((s, i) => {
    files.push([`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetXml(s.rows)}</sheetData></worksheet>`)]);
  });
  return zipStore(files);
}

// GET /api/admin/export.xlsx(token):综合导出(链接点击 + 答题全量详情)
function handleExportXlsx(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const clickRows = [['时间', '昵称', 'IP', '归属地', '品牌', '链接名', 'URL', '馆内坐标', '屏幕', '时区(分)', '语言', '平台', 'CPU核', '内存GB', '触屏', 'canvas指纹', '电量', '网络', 'UA']];
  for (const c of gateData.linkClicks) {
    const fp = c.fp || {}, dev = c.dev || {};
    clickRows.push([
      new Date(c.t).toLocaleString('zh-CN', { hour12: false }), c.name, c.ip, c.geo, c.brand,
      c.link, c.url, c.pos ? `${c.pos.x},${c.pos.y},${c.pos.z}` : '',
      fp.scr || '', fp.tz ?? '', fp.langs || fp.lang || '', fp.platform || '', fp.cores ?? '', fp.mem ?? '',
      fp.touch === undefined ? '' : String(fp.touch), fp.canvas || '', dev.battery || '', dev.network || '', c.ua,
    ]);
  }
  // 答题全量:题目/四选项内容/所选/正解/问答题目与作答原文/评分
  const quizRows = [['时间', '设备指纹', '总分', '选择题分', '问答分', '阅卷方', '问答评语', '问答题目', '问答作答原文', '题目', '选项A', '选项B', '选项C', '选项D', '访客选择', '正确选项', '是否答对']];
  for (const a of (gateData.quizAttempts || [])) {
    const base = [new Date(a.t).toLocaleString('zh-CN', { hour12: false }), a.dk || '', a.total, a.mcScore, a.qaScore, a.qaBy, a.qaComment || '', a.qaQ || '', (a.qaText || '').slice(0, 500)];
    const fr = a.fullReview || [];
    if (fr.length) {
      fr.forEach((m, i) => {
        quizRows.push(i === 0 ? base.concat([m.q, m.options && m.options.A, m.options && m.options.B, m.options && m.options.C, m.options && m.options.D, m.chosen, m.correctLetter, m.right ? '对' : '错'])
          : ['', '', '', '', '', '', '', '', '', m.q, m.options && m.options.A, m.options && m.options.B, m.options && m.options.C, m.options && m.options.D, m.chosen, m.correctLetter, m.right ? '对' : '错']);
      });
    } else {
      quizRows.push(base.concat(['', '', '', '', '', '', '', '']));
    }
  }
  const buf = xlsxOf([
    { name: '链接点击记录', rows: clickRows },
    { name: '答题全量记录', rows: quizRows },
  ]);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="gallery-data-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    'Content-Length': buf.length,
  });
  res.end(buf);
}

// POST /api/track/error(公开,访客端 JS 报错回传;仅后台可见)
if (!gateData.clientErrors) gateData.clientErrors = [];
// 2026-09-20 审计 H3:接入限流(30 条/分/IP,与 client-errors 同规)——
// 此前无限流,脚本高频打本接口可制造 saveGateData 全量写盘放大
const errRateMap = new Map(); // ip -> { n, t0 }
const ERR_WINDOW = 60 * 1000, ERR_MAX = 30;
function errRateOk(ip) {
  const now = Date.now();
  const r = errRateMap.get(ip);
  if (!r || now - r.t0 > ERR_WINDOW) { errRateMap.set(ip, { n: 1, t0: now }); return true; }
  r.n++;
  if (errRateMap.size > 5000) errRateMap.clear();
  return r.n <= ERR_MAX;
}
function handleTrackError(req, res) {
  const ip = realIP(req); // 2026-09-20 审计 M1 同源修正:可信代理头,不再裸 socket
  if (!errRateOk(ip)) { sendJson(res, 429, { error: 'too many' }); return; }
  readBody(req, obj => {
    const dk = deviceKey(req);
    const rec = findByDevice(req);
    const a = rec && rec.a;
    const err = {
      t: Date.now(),
      dk,
      name: a ? a.answer || '访客' : '访客',
      ip,
      brand: a ? a.brand || '' : '',
      msg: String(obj.msg || '').slice(0, 300),
      src: String(obj.src || '').slice(0, 200),
      line: obj.line || 0,
      ua: req.headers['user-agent'] || '',
    };
    gateData.clientErrors.push(err);
    if (gateData.clientErrors.length > ERR_CAP) gateData.clientErrors.splice(0, gateData.clientErrors.length - ERR_CAP);
    shadow.gateError(err); // 影子写 client_errors 表(channel='gate',追加信道)
    store.saveGateData();
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { handleTrackClick, handleClicksClear, handleExportXlsx, handleTrackError, flushTrack, CLICK_CAP, ERR_CAP };
