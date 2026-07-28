// track.js — 链接点击埋点:每一次点击都记录完整身份信息
// 记录字段(2026-07-25 主人定,越多越好):时间/昵称/IP/归属地/UA/品牌/电量网络/
//   设备指纹(屏幕/时区/语言/平台/核心/内存/触屏/canvas)/点击的链接/馆内坐标
// 记录全量保留;后台支持批量清理(POST /api/admin/clicks/clear)与导出(xlsx)
const crypto = require('crypto');
const zlib = require('zlib');
const { gateData, saveGateData, deviceKey, findByDevice } = require('./store');
const { sendJson, readBody } = require('./util');
const { tokenOk } = require('./admin');

if (!gateData.linkClicks) gateData.linkClicks = [];

// POST /api/track/click {link, url, pos, fp}(公开,访客点击链接时由前端触发)
function handleTrackClick(req, res) {
  readBody(req, obj => {
    const dk = deviceKey(req);
    // 档案里的已知身份(昵称/品牌/历史指纹)
    const rec = findByDevice(req);
    const a = rec && rec.a;
    // 前端顺带补采的指纹:档案没有就存上
    if (a && obj.fp && typeof obj.fp === 'object' && !a.fph) {
      const stable = [obj.fp.scr, obj.fp.avail, obj.fp.tz, obj.fp.lang, obj.fp.langs, obj.fp.platform, obj.fp.cores, obj.fp.mem, obj.fp.touch, obj.fp.maxTouch, obj.fp.canvas].join('|');
      a.fph = crypto.createHash('sha1').update((req.socket.remoteAddress || '') + '|' + stable).digest('hex').slice(0, 16);
      a.fp = obj.fp;
    }
    gateData.linkClicks.push({
      t: Date.now(),
      dk,
      name: a ? a.answer || '访客' : '访客',
      ip: req.socket.remoteAddress || '',
      geo: (gateData.geo && gateData.geo[req.socket.remoteAddress]) || '',
      ua: req.headers['user-agent'] || '',
      brand: a ? a.brand || '' : '',
      dev: a && a.dev ? a.dev : {},
      fp: obj.fp && typeof obj.fp === 'object' ? obj.fp : (a && a.fp ? a.fp : {}),
      link: String(obj.link || '').slice(0, 40),
      url: String(obj.url || '').slice(0, 300),
      pos: obj.pos && typeof obj.pos === 'object' ? { x: +obj.pos.x || 0, y: +obj.pos.y || 0, z: +obj.pos.z || 0 } : null,
    });
    // 上限(2026-07-28 OWASP 审计:公开接口无限写 → 数据库膨胀+全量落盘 DoS;与 clientErrors 同策略)
    if (gateData.linkClicks.length > 5000) gateData.linkClicks.splice(0, gateData.linkClicks.length - 5000);
    saveGateData();
    sendJson(res, 200, { ok: true });
  });
}

// POST /api/admin/clicks/clear(token):批量清理全部点击记录
function handleClicksClear(req, res, query) {
  if (!tokenOk(req, query)) { sendJson(res, 401, { error: '未授权' }); return; }
  const n = gateData.linkClicks.length;
  gateData.linkClicks = [];
  saveGateData();
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
function handleTrackError(req, res) {
  readBody(req, obj => {
    const dk = deviceKey(req);
    const rec = findByDevice(req);
    const a = rec && rec.a;
    gateData.clientErrors.push({
      t: Date.now(),
      dk,
      name: a ? a.answer || '访客' : '访客',
      ip: req.socket.remoteAddress || '',
      brand: a ? a.brand || '' : '',
      msg: String(obj.msg || '').slice(0, 300),
      src: String(obj.src || '').slice(0, 200),
      line: obj.line || 0,
      ua: req.headers['user-agent'] || '',
    });
    if (gateData.clientErrors.length > 500) gateData.clientErrors.splice(0, gateData.clientErrors.length - 500);
    saveGateData();
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { handleTrackClick, handleClicksClear, handleExportXlsx, handleTrackError };
