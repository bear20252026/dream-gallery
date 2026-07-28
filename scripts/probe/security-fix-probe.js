// security-fix-probe.js — OWASP 审计修复项复验(2026-07-28)
// 断言:①SVG 响应禁脚本头 ②HTML nosniff/XFO ③vid 归属(伪造 UA 拿不到 myUploads) ④token 错误 401/正确 200
//   ⑤linkClicks 上限逻辑存在 ⑥vision 限额 429
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
  fs.writeFileSync(path.join(ROOT, 'gate_data.json'), JSON.stringify({
    secret: 'test-secret', applicants: {
      vidAAA: { dk: 'dk-uploader', ua: 'RealUser/1.0', answer: '真主', status: 'approved', level: 'perm', applyTime: 1, approveTime: 1 },
    }, stats: { total: 0, byDay: {} }, blockedIps: [], watchIps: [], uploads: {}, chat: [], siteConfig: { mode: 'normal', customLinks: [], demoPhotos: [] },
  }, null, 1));
  server.kill();
  const s2 = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: '3223', TOKEN: 'audit-t0ken', GATE_MODE: 'approval' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => s2.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));

  // [1] SVG 上传后响应头禁脚本
  fs.writeFileSync(path.join(ROOT,'.audit-tmp.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const up = await fetch(B + '/api/upload?dir=photos&name=sec-test.svg', {
    method: 'POST', headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA', 'content-type': 'application/octet-stream' },
    body: fs.readFileSync(path.join(ROOT,'.audit-tmp.svg')),
  });
  ok(up.status === 201, 'SVG 仍可上传(功能不变) ' + up.status);
  const svgRes = await fetch(B + '/photos/sec-test.svg', { headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA' } });
  const csp = svgRes.headers.get('content-security-policy') || '';
  ok(svgRes.status === 200 && csp.includes("script-src 'none'"), 'SVG 响应带 CSP script-src none: ' + csp);
  ok(svgRes.headers.get('x-content-type-options') === 'nosniff', 'SVG 响应带 nosniff');

  // [2] HTML 安全头
  const idx = await fetch(B + '/index.html');
  ok(idx.headers.get('x-frame-options') === 'SAMEORIGIN' && idx.headers.get('x-content-type-options') === 'nosniff', 'HTML 带 XFO/nosniff');

  // [3] vid 归属:上传记录的 aid=vidAAA
  const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'gate_data.json'), 'utf8'));
  ok(gd.uploads['sec-test.svg'] && gd.uploads['sec-test.svg'].aid === 'vidAAA', '上传记录含 vid 归属 aid');
  // 本人(vid+UA)能拿到 myUploads
  const mine = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': 'RealUser/1.0', 'cookie': 'vid=vidAAA' } })).json();
  ok(mine.myUploads.includes('sec-test.svg'), '本人(vid)拿到 myUploads');
  // 伪造者:无 vid、不同 UA(不同 dk)→ 拿不到
  const fake = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': 'EvilUser/9.9' } })).json();
  ok(!fake.myUploads.includes('sec-test.svg'), '伪造者(不同 UA 无 vid)拿不到 myUploads');
  // 伪造者直接读文件(不同 dk)→ 403
  const steal = await fetch(B + '/photos/sec-test.svg', { headers: { 'user-agent': 'EvilUser/9.9' } });
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

  // 清理
  fs.unlinkSync(path.join(ROOT, 'photos', 'sec-test.svg'));
  fs.unlinkSync(path.join(ROOT, 'gate_data.json')); try{fs.unlinkSync(path.join(ROOT,'.audit-tmp.svg'));}catch(e){}
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  s3.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
