#!/usr/bin/env node
// api-ban-upload-probe.cjs — 第一批安全止血的**端到端**验收(2026-10-12,第四轮外部审计)
//
// 为什么单开这一条:lib-api-ban-guard / lib-whiteboard-overwrite 那两套单测喂给处理器的是**手搓的 req 对象**,
// 它们能证明"函数逻辑对",证明不了三件真实 HTTP 层才暴露的事:
//   ① 守卫是不是真的排在 dispatch **之前**(路由表顺序、pathname 归一、方法大小写);
//   ② 403 那条响应头/体在真 socket 上长成什么样(no-store 有没有被 applySecurityHeaders 覆盖掉);
//   ③ 白板"判定在打开文件之前"在真实磁盘上是否真的一字节未写。
// AGENTS 的血泪规矩:"断言写对了"不等于"测到了" ⇒ 本探针必须真发出每一条请求,并回读实际响应字段。
//
// 用法:node scripts/probe/api-ban-upload-probe.cjs
//   自己起一台**本地**服务器(默认 127.0.0.1:3227),零生产接触;数据文件与 SQLite 全部指向系统临时目录。
//   退出码:0 全过 / 1 有失败 / 2 起不来服务器或前置条件缺失。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const PORT = process.env.PROBE_PORT || '3227';
const B = `http://127.0.0.1:${PORT}`;
const TOKEN = 'probe-tok-' + crypto.randomBytes(6).toString('hex');

// 数据彻底隔离:临时 gate_data.json + 临时 db + 关掉保留期清扫与自动台账
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'apiban-probe-'));
const DATA_FILE = path.join(TMP, 'gate_data.json');
const PHOTO_DIR = path.join(ROOT, 'photos'); // 上传目录固定在 photos(服务端钉死),用完逐个删

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')); }
};

const VA = 'vid-probe-A';   // 被拉黑 IP 上的干净设备
const VB = 'vid-probe-B';   // 被踢出的设备
const VC = 'vid-probe-C';   // 干净访客(白板归属者)
const VD = 'vid-probe-D';   // 另一个干净访客(想覆盖 C 的作品)
const BAD_IP = '203.0.113.66';
const GOOD_IP = '203.0.113.99';
const UA_A = 'Mozilla/5.0 (probe-visitor-A)';
const UA_B = 'Mozilla/5.0 (probe-visitor-B)';
const UA_C = 'Mozilla/5.0 (probe-visitor-C)';
const UA_D = 'Mozilla/5.0 (probe-visitor-D)';
const WB_NAME = 'whiteboard-probe-owned.png';

function seed() {
  const now = Date.now();
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    secret: 'probe-secret',
    blockedIps: [BAD_IP],
    stats: {},
    applicants: {
      [VA]: { id: VA, dk: 'dk-a', ua: UA_A, answer: '甲', status: 'approved', applyTime: now, approveTime: now },
      [VB]: { id: VB, dk: 'dk-b', ua: UA_B, answer: '乙', status: 'kicked', applyTime: now, approveTime: now, kickedTime: now - 1000 },
      [VC]: { id: VC, dk: 'dk-c', ua: UA_C, answer: '丙', status: 'approved', applyTime: now, approveTime: now },
      [VD]: { id: VD, dk: 'dk-d', ua: UA_D, answer: '丁', status: 'approved', applyTime: now, approveTime: now },
    },
    uploads: {
      [WB_NAME]: { dk: 'dk-c', aid: VC, ts: now - 60000, mt: 'probe-mt-cccccccccc', v: 1, mine: true, dir: 'photos' },
    },
    userLinks: { [VA]: [] },
  }, null, 1));
  // 白板既有作品必须真的在盘上(才能证明"判定早于打开文件")
  const marker = 'PRE-EXISTING-BYTES-DO-NOT-TOUCH';
  fs.writeFileSync(path.join(PHOTO_DIR, WB_NAME), marker);
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(PHOTO_DIR, WB_NAME))).digest('hex');
}

const created = [];
function track(p) { created.push(p); return p; }
function cleanup() {
  for (const p of created) { try { fs.unlinkSync(p); } catch (e) {} }
  try { fs.unlinkSync(path.join(PHOTO_DIR, WB_NAME)); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

async function req(method, p, { ip = GOOD_IP, ua = UA_C, vid = null, token = null, body = null, headers = {}, stream = false } = {}) {
  const h = { 'user-agent': ua, 'cf-connecting-ip': ip, ...headers };
  if (vid) h.cookie = 'vid=' + vid;
  if (token) h['x-token'] = token;
  if (body !== null && typeof body === 'string') h['content-type'] = h['content-type'] || 'application/json';
  // SSE(/api/entry/watch)永不结束:fetch 默认等 body 读完 ⇒ 整条探针挂死。
  // 流式端点只取状态与响应头,读完主动取消 body;所有请求都套一条硬超时,任何悬挂都不许拖住探针。
  const res = await fetch(B + p, {
    method,
    headers: h,
    body: body === null ? undefined : body,
    redirect: 'manual',
    signal: AbortSignal.timeout(stream ? 8000 : 20000),
  });
  if (stream) {
    try { await res.body?.cancel({ reason: 'probe only needs status' }); } catch (e) {}
    return { status: res.status, headers: res.headers, json: null, text: '' };
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, headers: res.headers, json, text };
}

(async () => {
  const shaBefore = seed();
  const env = {
    ...process.env,
    PORT, HOST: '127.0.0.1', TOKEN,
    GATE_DATA_FILE: DATA_FILE,
    SQLITE_PATH: path.join(TMP, 'gate_data.db'),
    USE_SQLITE: '0',                 // 本探针只测 HTTP 层结论,不建库
    RETENTION_DISABLED: '1',
    R2_OUTBOX_DISABLE: '1',
    R2_OUTBOX_FILE: path.join(TMP, 'r2-outbox.json'),
    NODE_ENV: '',
    MULTI: 'off',
    NSFW_MODERATE: '',               // 关审核:本探针不测审核,且零 AI 调用
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const boot = await new Promise((resolve) => {
    let buf = '';
    const t = setTimeout(() => resolve({ ok: false, log: buf }), 25000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      if (/服务器已启动|listening|:3227/i.test(buf)) { clearTimeout(t); resolve({ ok: true }); }
    });
    child.stderr.on('data', (d) => { buf += d.toString(); });
  });
  if (!boot.ok) { console.log('❌ 本地服务器起不来:' + String(boot.log || '').slice(0, 300)); cleanup(); child.kill(); process.exit(2); }

  try {
    // ---------- ① 被拉黑 IP:公开 API 一律 403,而且必须先于 dispatch ----------
    const blockedChat = await req('POST', '/api/chat', { ip: BAD_IP, ua: UA_A, vid: VA, body: JSON.stringify({ text: "probe-from-blocked-ip" }) });
    ok(blockedChat.status === 403, '拉黑 IP 打 POST /api/chat → 403(不再是"页面挡住了、API 敞着")', 'status=' + blockedChat.status);
    ok(blockedChat.json && blockedChat.json.error, '403 回的是 JSON 错误体而不是 HTML 页面', blockedChat.text.slice(0, 60));
    const cc = String(blockedChat.headers.get('cache-control') || '');
    ok(/no-store/.test(cc), '被拦响应带 Cache-Control: no-store(共享缓存不许回放)', cc || '(无)');

    // 豁免的四条认领回路必须还活着(拦了它们=被踢的人看不见踢出、也递不了申请)
    const exemptStatus = await req('GET', '/api/entry/status', { ip: BAD_IP, ua: UA_A, vid: VA });
    ok(exemptStatus.status === 200, '豁免通路 GET /api/entry/status 对拉黑 IP 仍放行(状态可查)', 'status=' + exemptStatus.status);
    const cleanStatus = await req('GET', '/api/entry/status', { ip: GOOD_IP, ua: UA_C, vid: VC });
    ok(cleanStatus.status === 200, '干净 IP 的 /api/entry/status 不受影响', 'status=' + cleanStatus.status);

    // ---------- ② 被踢设备:kick 现在真的切断 API ----------
    const kickedWish = await req('POST', '/api/wish', { ua: UA_B, vid: VB, body: JSON.stringify({ text: 'probe-from-kicked' }) });
    ok(kickedWish.status === 403, '被踢设备打 POST /api/wish → 403(kick 不再只是赶出画面)', 'status=' + kickedWish.status);
    const kickedWatch = await req('GET', '/api/entry/watch', { ua: UA_B, vid: VB, stream: true });
    ok(kickedWatch.status === 200 || kickedWatch.status === 503, '被踢设备仍能连 /api/entry/watch(kick 的即时送达通道不许被自己拦掉)', 'status=' + kickedWatch.status);
    const kickedRename = await req('POST', '/api/entry/rename', { ua: UA_B, vid: VB, body: JSON.stringify({ n: 'hijack' }) });
    ok(kickedRename.status === 403, '被踢设备打 /api/entry/rename → 403(它仍属公开 API,不豁免)', 'status=' + kickedRename.status);

    // ---------- ③ 干净访客不受影响 ----------
    const cleanChat = await req('POST', '/api/chat', { ua: UA_C, vid: VC, body: JSON.stringify({ text: "probe-clean-visitor" }) });
    ok(cleanChat.status === 200, '干净访客的 POST /api/chat 照旧成功(守卫不是误伤)', 'status=' + cleanChat.status + ' ' + cleanChat.text.slice(0, 60));
    // 守卫只读:不新建档案、不动 blockedIps
    const seededIds = Object.keys(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).applicants || {}).sort().join(',');
    await req('GET', '/api/chat', { ua: 'Mozilla/5.0 (probe-stranger-never-seen)', ip: '198.51.100.9' });
    const afterIds = Object.keys(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).applicants || {}).sort().join(',');
    ok(seededIds === afterIds, '守卫是只读的:陌生请求没有新建访客档案、没有落盘', afterIds);

    // ---------- ④ 白板:匿名/他人一律改不动,且判定早于打开文件 ----------
    const noCookie = await req('POST', `/api/upload?dir=photos&name=${WB_NAME}`, { ua: UA_D, body: Buffer.from('X'.repeat(120)) });
    ok(noCookie.status === 401, '无 Cookie 覆盖既有白板 → 401(没表明身份,与"不是你的画"分开)', 'status=' + noCookie.status);
    const otherOwner = await req('POST', `/api/upload?dir=photos&name=${WB_NAME}`, { ua: UA_D, vid: VD, body: Buffer.from('X'.repeat(120)) });
    ok(otherOwner.status === 409, '别人的有效身份覆盖他人白板 → 409', 'status=' + otherOwner.status);
    const shaAfter = crypto.createHash('sha256').update(fs.readFileSync(path.join(PHOTO_DIR, WB_NAME))).digest('hex');
    ok(shaAfter === shaBefore, '两次被拒之后,原作品字节一字未动(判定发生在打开文件之前)');
    const seed2 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    ok(seed2.uploads[WB_NAME].aid === VC && seed2.uploads[WB_NAME].mt === 'probe-mt-cccccccccc',
      '被拒之后归属与分享令牌也没被搬走', JSON.stringify(seed2.uploads[WB_NAME]));

    // 匿名新作品:名字必须由服务端签发(不是客户端提的那个)
    const newBoard = await req('POST', '/api/upload?dir=photos&name=whiteboard-client-chosen.png', { ua: UA_D, vid: VD, body: Buffer.from('X'.repeat(120)) });
    ok(newBoard.status === 201 && newBoard.json && newBoard.json.issued === true,
      '匿名新白板 → 201 且 issued:true(前端须改用服务端回的名字)', 'status=' + newBoard.status + ' body=' + String(newBoard.text).slice(0, 80));
    const issued = newBoard.json && newBoard.json.name;
    ok(!!issued && issued !== 'whiteboard-client-chosen.png' && /^whiteboard-\d{8}-\d{6}-[0-9a-f]{8}\.png$/.test(issued),
      '服务端签发名形态正确且不吃客户端提的名字', String(issued));
    if (issued) {
      track(path.join(PHOTO_DIR, issued));
      ok(!fs.existsSync(path.join(PHOTO_DIR, 'whiteboard-client-chosen.png')), '客户端挑的名字从未落盘');
    }

    // ---------- ⑤ 匿名侧目录钉死:白板名只能进 photos ----------
    const wrongDir = await req('POST', '/api/upload?dir=videos&name=' + encodeURIComponent('whiteboard-x.png'), { ua: UA_D, vid: VD, body: Buffer.from('X'.repeat(120)) });
    ok(wrongDir.status === 403, 'dir=videos 配白板名 → 403(匿名写媒体目录的第二条洞已堵)', 'status=' + wrongDir.status);

    // ---------- ⑥ 访客链接:无有效会话 401 ----------
    const mylinks = await req('POST', '/api/mylinks', { ua: UA_C, body: JSON.stringify({ url: 'https://example.com', label: 'probe' }) });
    ok(mylinks.status === 401, '无 Cookie 的 POST /api/mylinks → 401(旧实现靠"Cookie 恰好存在"自证身份)', 'status=' + mylinks.status);
    const mylinksBad = await req('POST', '/api/mylinks', { ua: UA_B, vid: VB, body: JSON.stringify({ url: 'https://example.com', label: 'probe' }) });
    ok(mylinksBad.status === 403, '被踢设备的 /api/mylinks 先被 API 闸拦下 → 403(守卫在处理器之前)', 'status=' + mylinksBad.status);

    // ---------- ⑦ 后台 token 直传语义未回退:可以挑名、可以覆盖 ----------
    const adminWrite = await req('POST', `/api/upload?dir=photos&name=${WB_NAME}`, { ua: UA_C, token: TOKEN, body: Buffer.from('ADMIN-REPLACE') });
    ok(adminWrite.status === 201 && adminWrite.json && adminWrite.json.name === WB_NAME,
      '后台 token 直传仍可挑名并覆盖(主人改画的路径一条没变)', 'status=' + adminWrite.status + ' name=' + (adminWrite.json && adminWrite.json.name));
    const adminOver = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).uploads[WB_NAME];
    ok(adminOver && adminOver.aid === VC, '后台覆盖不动匿名归属记录(不会把画"洗"到管理员名下)', JSON.stringify(adminOver));
  } catch (e) {
    fail++;
    console.log('  ✗ 探针自身异常:' + (e && e.message));
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => { const t = setTimeout(r, 3000); child.on('exit', () => { clearTimeout(t); r(); }); });
    cleanup();
  }

  console.log(`\n=== 拉黑/封禁与上传归属 端到端验收:${pass} 通过 / ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})();
