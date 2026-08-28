// security-fix-probe.js — OWASP 审计修复项复验(2026-07-28)
// 断言(2026-08-29 更新):①SVG 上传被拒 + 白名单无 .svg + 存量 SVG 仍有 CSP script-src 'none' 兜底
//   ②媒体/HTML 的 nosniff 与 XFO ③vid 归属 aid 正确、伪造 UA 拿不到 myUploads 且直读 403
//   ④token 错误 401/正确 200 ⑤vision 限额 429 ⑥linkClicks 上限逻辑存在
// 变更说明:原「SVG 仍可上传 + 响应带 CSP」已过时(2026-07-31 起白名单直接移除 svg,姿态更强);
//   上传归属/越权类断言改用普通图片做载体(该逻辑与文件类型无关)。
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3223', TOKEN: 'audit-t0ken', GATE_MODE: 'approval' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const B = 'http://localhost:3223';

  // 建档拿 vid(审批门接口无 GATE_MODE 时不可用,直接 /api/gate/apply?——无 approval 模式时该路由不挂,
  // 改用静态首页 autoAdmit?也无 approval。这里手动构造 vid:先调任意接口拿 Set-Cookie…没有。
  // 简化:直接造 applicant —— 借 quiz/start 之外的公开接口不行,改读 gate_data.json 注入。
  // ⚠️ 必须先杀掉 s1 并等它真正退出,再写种子(2026-08-29 修):saveGateData() 是异步写链
  //    (_writeChain.then 里 writeFileSync+rename),s1 存活期间写种子,会被 s1 尚未落盘的
  //    写入覆盖掉 → s2 启动时加载到无 vidAAA 的数据 → ownerAid() 取不到 vid、aid 变 null。
  //    这个竞态曾让「上传记录含 vid 归属 aid」间歇性失败(时红时绿)。
  server.kill();
  await new Promise((r) => {
    const t = setTimeout(r, 3000);
    server.on('exit', () => { clearTimeout(t); r(); });
  });
  fs.writeFileSync(path.join(ROOT, 'gate_data.json'), JSON.stringify({
    secret: 'test-secret', applicants: {
      vidAAA: { dk: 'dk-uploader', ua: 'RealUser/1.0', answer: '真主', status: 'approved', level: 'perm', applyTime: 1, approveTime: 1 },
    }, stats: { total: 0, byDay: {} }, blockedIps: [], watchIps: [], uploads: {}, chat: [], siteConfig: { mode: 'normal', customLinks: [], demoPhotos: [] },
  }, null, 1));
  const s2 = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3223', TOKEN: 'audit-t0ken', GATE_MODE: 'approval' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => s2.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));

  // [1] SVG 安全 —— 2026-07-31 起改为「白名单直接移除 svg」(比 CSP 兜底更彻底:
  //     SVG 可含脚本导致 XSS,即使加了 script-src 'none' 仍需额外维护)。
  //     旧断言「SVG 仍可上传 201 + 响应带 CSP」已过时,现按当前设计断言:
  //     ① 上传被拒 ② 白名单无 .svg ③ 存量 SVG 仍有 CSP 覆盖兜底。
  fs.writeFileSync(path.join(ROOT,'.audit-tmp.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const up = await fetch(B + '/api/upload?dir=photos&name=sec-test.svg', {
    method: 'POST', headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA', 'content-type': 'application/octet-stream' },
    body: fs.readFileSync(path.join(ROOT,'.audit-tmp.svg')),
  });
  ok(up.status === 400, 'SVG 上传被拒(白名单已移除 svg) ' + up.status);
  const filesSrc = fs.readFileSync(path.join(ROOT, 'lib', 'files.js'), 'utf8');
  ok(!/PUBLIC_IMG_EXT[\s\S]{0,300}?\.svg/.test(filesSrc), 'PUBLIC_IMG_EXT 白名单不含 .svg');
  ok(filesSrc.includes("script-src 'none'"), '存量 SVG 仍有 CSP script-src none 兜底');

  // [2] HTML 安全头
  const idx = await fetch(B + '/index.html');
  ok(idx.headers.get('x-frame-options') === 'SAMEORIGIN' && idx.headers.get('x-content-type-options') === 'nosniff', 'HTML 带 XFO/nosniff');

  // [3] vid 归属 / 越权防护 —— 载体改用普通图片(.png,在白名单内)。
  //     归属与越权和文件类型无关,原来借 SVG 传只是历史巧合;SVG 被移除后必须换载体,
  //     否则这 4 项会随 [1] 一起误报失败。
  const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAAX+Av7czFnnAAAAAElFTkSuQmCC', 'base64');
  const upPng = await fetch(B + '/api/upload?dir=photos&name=sec-test.png', {
    method: 'POST', headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA', 'content-type': 'application/octet-stream' },
    body: PNG_1x1,
  });
  ok(upPng.status === 201, '普通图片可上传(功能不变) ' + upPng.status);
  const pngRes = await fetch(B + '/photos/sec-test.png', { headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA' } });
  ok(pngRes.headers.get('x-content-type-options') === 'nosniff', '媒体响应带 nosniff');
  // vid 归属:上传记录的 aid=vidAAA
  // ⚠️ 必须轮询等落盘(2026-08-29 修):lib/store.js 的 saveGateData() 是**异步**的
  //    (_writeChain.then 里 writeFileSync+rename),而 files.js 是先调落盘、立刻回 201,
  //    故 HTTP 响应返回时磁盘可能还没写完——直接 readFileSync 会读到旧内容而误报失败。
  const readGate = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'gate_data.json'), 'utf8'));
  const waitForUpload = async (name, ms = 5000) => {
    const t0 = Date.now();
    let d = readGate();
    while (!(d.uploads && d.uploads[name]) && Date.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 100));
      d = readGate();
    }
    return d;
  };
  const gd = await waitForUpload('sec-test.png');
  const rec = gd.uploads['sec-test.png'];
  ok(!!rec && rec.aid === 'vidAAA', '上传记录含 vid 归属 aid → rec=' + JSON.stringify(rec || null) + ' applicants=' + JSON.stringify(Object.keys(gd.applicants || {})));
  // 本人(vid+UA)能拿到 myUploads
  const mine = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA' } })).json();
  ok(mine.myUploads.includes('sec-test.png'), '本人(vid)拿到 myUploads');
  // 伪造者:无 vid、不同 UA(不同 dk)→ 拿不到
  const fake = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': 'EvilUser/9.9' } })).json();
  ok(!fake.myUploads.includes('sec-test.png'), '伪造者(不同 UA 无 vid)拿不到 myUploads');
  // 伪造者直接读文件(不同 dk)→ 403
  const steal = await fetch(B + '/photos/sec-test.png', { headers: { 'user-agent': 'EvilUser/9.9' } });
  ok(steal.status === 403, '伪造者直接读文件 403');

  // [4] token 常量时间比较:错 401 对 200
  const bad = await fetch(B + '/api/admin/list?token=wrong-t0ken');
  const good = await fetch(B + '/api/admin/list?token=audit-t0ken');
  ok(bad.status === 401 && good.status === 200, 'token 错误 401 / 正确 200(timingSafeEqual)');

  // [5] vision 限额:构造 21 张本人照片记录,第 21 次应 429
  const gd2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'gate_data.json'), 'utf8'));
  for (let i = 0; i < 21; i++) gd2.uploads['vq' + i + '.jpg'] = { dk: 'dk-uploader', aid: 'vidAAA', ts: Date.now(), mt: 'x' + i };
  fs.writeFileSync(path.join(ROOT, 'gate_data.json'), JSON.stringify(gd2, null, 1));
  s2.kill();
  const s3 = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3223', TOKEN: 'audit-t0ken', GATE_MODE: 'approval', AI_GRADE_API_KEY: '', AI_GRADE_API_KEY_BACKUP: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => s3.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  // 文件要真实存在(vision 读盘);造 21 个小文件,走完 20 次配额后第 21 次 429
  for (let i = 0; i < 21; i++) fs.writeFileSync(path.join(ROOT, 'photos', 'vq' + i + '.jpg'), 'x');
  let lastStatus = 0;
  for (let i = 0; i < 21; i++) {
    const r = await fetch(B + '/api/vision/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA' }, body: JSON.stringify({ file: 'vq' + i + '.jpg' }) });
    lastStatus = r.status;
  }
  ok(lastStatus === 429, 'vision 第 21 次分析被限额 429(实际 ' + lastStatus + ')');
  for (let i = 0; i < 21; i++) fs.unlinkSync(path.join(ROOT, 'photos', 'vq' + i + '.jpg'));

  // [6] linkClicks 上限:源码断言(打 5001 次太慢)
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'track.js'), 'utf8');
  ok(/linkClicks\.length > 5000/.test(src), 'linkClicks 5000 上限已写入源码');

  // 清理(逐个 try:清理失败不应让整个探针崩掉、吞掉已得出的结论)
  for (const f of [path.join(ROOT, 'photos', 'sec-test.png'), path.join(ROOT, 'gate_data.json'), path.join(ROOT, '.audit-tmp.svg')]) {
    try { fs.unlinkSync(f); } catch (e) {}
  }
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  s3.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
