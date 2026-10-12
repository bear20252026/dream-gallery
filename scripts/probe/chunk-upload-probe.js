// chunk-upload-probe.js — 分片上传(2026-07-28 晚高峰应急)验收
// 断言:①分片重组 sha256 与原文件一致 ②归属/mt 签发 ③归属只认有效会话(同 UA 无 Cookie 一律看不见)
//       ④缺片拦截 ⑤同名 409 ⑥单片超 400KB 拦截
//
// ⚠️ 2026-10-12 两处修正(都是"探针自己骗自己"这一类):
//   a) 原断言③写的是"同 UA 可见 myUploads"——那是 2026-10-11 DG-SEC-001/002 **之前**的语义。
//      现在 UA/dk 不再授予归属:记录带 `aid` 就只认 `aid === authVid(有效 vid Cookie)`,
//      无 Cookie 的同 UA 请求必须什么都看不到(否则同款机型的陌生人能互列私有文件名)。
//      ⇒ 这里改成**两条**断言:带本人会话看得见 + 同 UA 无 Cookie 看不见,后者正是原断言
//      悄悄放弃掉的那一半覆盖。
//   b) 原实现用 `{...process.env}` 起服务并读写**仓库真实 gate_data.json**(结尾还手工删字段),
//      与其他套件抢同一个文件 ⇒ Windows EPERM / Linux ENOENT 的假红根因(本会话已因此修过 8 个套件)。
//      现在数据文件与 SQLite 全部指向系统临时目录。
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
(async () => {
  // 数据彻底隔离:临时 gate_data.json + 临时 db(上传文件仍落真实 photos/,结尾逐个清理)
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chunkprobe-'));
  const DATA_FILE = path.join(TMP, 'gate_data.json');
  const VID = 'chunk-probe-vid';
  const UA = 'chunk-probe/1.0';
  // 被 kill(timeout / Ctrl+C)时 finally 不跑 ⇒ 临时目录与 photos/ 里的探针文件会留下;信号兜底必留
  const sweep = () => {
    for (const f of ['chunk-probe.png', 'chunk-part.png', 'chunk-big.png']) { try { fs.unlinkSync(path.join(ROOT, 'photos', f)); } catch (e) {} }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  };
  process.on('SIGTERM', () => { sweep(); process.exit(143); });
  process.on('SIGINT', () => { sweep(); process.exit(130); });
  process.on('uncaughtException', (e) => { console.error('FATAL', e); sweep(); process.exit(1); });
  // 预置一个"本人"档案:status=approved 且**不带 sess**(存量档案按迁移护栏视为有效会话)
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    secret: 'chunkprobe-secret',
    stats: {},
    applicants: { [VID]: { id: VID, dk: 'chunkprobe-dk', ua: UA, answer: '探针', status: 'approved', applyTime: 1, approveTime: 1 } },
    uploads: {},
  }, null, 1));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: '3228',
      TOKEN: 'chunkprobe-token',
      NODE_ENV: '',
      GATE_DATA_FILE: DATA_FILE,
      SQLITE_PATH: path.join(TMP, 'gate_data.db'),
      RETENTION_DISABLED: '1',
      R2_OUTBOX_FILE: path.join(TMP, 'r2-outbox.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const B = 'http://localhost:3228';
  // 造一个 700KB 的可识别内容文件(非合法图片也无妨,扩展名用 .png 过白名单)
  const raw = Buffer.alloc(700 * 1024);
  for (let i = 0; i < raw.length; i += 997) raw[i] = (i / 997) % 251;
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  const CH = 256 * 1024, total = Math.ceil(raw.length / CH), name = 'chunk-probe.png';
  const post = (url, body, cookie = null) => fetch(B + url, {
    method: 'POST',
    body,
    headers: { 'user-agent': UA, ...(cookie ? { cookie } : {}) },
  });

  // ① 逐片上传(带本人会话:归属记录的 aid 由 authVid 取,无 Cookie 就落不成"本人")
  for (let i = 0; i < total - 1; i++) {
    const r = await post(`/api/upload/chunk?dir=photos&name=${name}&seq=${i}&total=${total}`, raw.subarray(i * CH, (i + 1) * CH), 'vid=' + VID);
    if (i < total - 1) ok(r.status === 200, `第 ${i + 1}/${total} 片 200`);
  }
  const fin = await post(`/api/upload/chunk?dir=photos&name=${name}&seq=${total - 1}&total=${total}`, raw.subarray((total - 1) * CH), 'vid=' + VID);
  const fd = await fin.json();
  ok(fin.status === 201 && fd.ok && typeof fd.mt === 'string' && fd.mt.length >= 16, '最后一片 201 且签发 mt');

  // ② 重组字节一致
  const saved = fs.readFileSync(path.join(ROOT, 'photos', name));
  ok(crypto.createHash('sha256').update(saved).digest('hex') === digest, '重组文件 sha256 与原文件一致');
  ok(saved.length === raw.length, '重组文件大小一致');

  // ③ 归属:带本人有效会话才看得见;同 UA 无 Cookie 必须看不见(2026-10-11 DG-SEC-001/002)
  const scMine = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': UA, cookie: 'vid=' + VID } })).json();
  ok((scMine.myUploads || []).includes(name), '本人会话的 siteconfig 含分片文件');
  ok(typeof scMine.myUploadTokens?.[name] === 'string' && scMine.myUploadTokens[name].length >= 16,
    '本人拿到该分片文件的 mt 令牌(图片代理 UA 漂移时仍认得出本人)');
  const scStranger = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': UA } })).json();
  ok(!(scStranger.myUploads || []).includes(name), '同 UA 但无 Cookie ⇒ 看不见(UA 不再授予归属)');

  // ④ 同名 409
  const dup = await post(`/api/upload/chunk?dir=photos&name=${name}&seq=0&total=1`, Buffer.from('x'));
  ok(dup.status === 409, '同名文件 409(禁止覆盖)');

  // ⑤ 缺片拦截
  await post('/api/upload/chunk?dir=photos&name=chunk-part.png&seq=0&total=3', Buffer.alloc(100));
  const miss = await post('/api/upload/chunk?dir=photos&name=chunk-part.png&seq=2&total=3', Buffer.alloc(100));
  ok(miss.status === 409, '缺中间片时组装被拒 409');

  // ⑥ 单片超限 413
  const big = await post('/api/upload/chunk?dir=photos&name=chunk-big.png&seq=0&total=1', Buffer.alloc(401 * 1024));
  ok(big.status === 413, '单片超 400KB 返回 413');

  // 清理:只摘自己造的文件(整目录 rm 会把并发跑着的别的上传的在途分片一起删掉)
  for (const f of [name, 'chunk-part.png', 'chunk-big.png']) {
    try { fs.unlinkSync(path.join(ROOT, 'photos', f)); } catch (e) {}
  }
  try {
    const CD = path.join(ROOT, '.chunks');
    if (fs.existsSync(CD)) {
      for (const f of fs.readdirSync(CD)) {
        if (/^(chunk-probe\.png|chunk-part\.png|chunk-big\.png)/.test(f) || /-(chunk-probe\.png|chunk-part\.png|chunk-big\.png)\./.test(f)) {
          try { fs.unlinkSync(path.join(CD, f)); } catch (e) {}
        }
      }
    }
  } catch (e) {}
  // 数据本来就在临时目录里 —— 但**必须先等服务器退出**再删:SQLite 句柄还开着时 rmSync 会静默失败
  // (Windows 上实测留下过一个孤儿目录)。绝不再回写仓库真实 gate_data.json。
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  server.kill('SIGTERM');
  await new Promise(r => { const t = setTimeout(r, 20000); server.on('exit', () => { clearTimeout(t); r(); }); });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { console.log('⚠️ 临时目录没删掉,请手工清理:' + TMP); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
