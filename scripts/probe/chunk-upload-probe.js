// chunk-upload-probe.js — 分片上传(2026-07-28 晚高峰应急)验收
// 断言:①分片重组 md5 与原文件一致 ②归属/mt 签发 ③缺片拦截 ④同名 409 ⑤单片超 400KB 拦截
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3228' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => server.stdout.on('data', d => d.toString().includes('服务器已启动') && r()));
  const B = 'http://localhost:3228';
  // 造一个 700KB 的可识别内容文件(非合法图片也无妨,扩展名用 .png 过白名单)
  const raw = Buffer.alloc(700 * 1024);
  for (let i = 0; i < raw.length; i += 997) raw[i] = (i / 997) % 251;
  const md5 = crypto.createHash('md5').update(raw).digest('hex');
  const CH = 256 * 1024, total = Math.ceil(raw.length / CH), name = 'chunk-probe.png';
  const post = (url, body) => fetch(B + url, { method: 'POST', body, headers: { 'user-agent': 'chunk-probe/1.0' } });

  // ① 逐片上传
  for (let i = 0; i < total - 1; i++) {
    const r = await post(`/api/upload/chunk?dir=photos&name=${name}&seq=${i}&total=${total}`, raw.subarray(i * CH, (i + 1) * CH));
    if (i < total - 1) ok(r.status === 200, `第 ${i + 1}/${total} 片 200`);
  }
  const fin = await post(`/api/upload/chunk?dir=photos&name=${name}&seq=${total - 1}&total=${total}`, raw.subarray((total - 1) * CH));
  const fd = await fin.json();
  ok(fin.status === 201 && fd.ok && typeof fd.mt === 'string' && fd.mt.length >= 16, '最后一片 201 且签发 mt');

  // ② 重组字节一致
  const saved = fs.readFileSync(path.join(ROOT, 'photos', name));
  ok(crypto.createHash('md5').update(saved).digest('hex') === md5, '重组文件 md5 与原文件一致');
  ok(saved.length === raw.length, '重组文件大小一致');

  // ③ 归属:同 UA 可见 myUploads
  const sc = await (await fetch(B + '/api/siteconfig', { headers: { 'user-agent': 'chunk-probe/1.0' } })).json();
  ok((sc.myUploads || []).includes(name), 'siteconfig 归属含分片文件');

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

  // 清理
  for (const f of [name, 'chunk-part.png', 'chunk-big.png']) {
    try { fs.unlinkSync(path.join(ROOT, 'photos', f)); } catch (e) {}
  }
  try { fs.rmSync(path.join(ROOT, '.chunks'), { recursive: true }); } catch (e) {}
  const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'gate_data.json'), 'utf8'));
  for (const f of [name, 'chunk-part.png', 'chunk-big.png']) if (gd.uploads) delete gd.uploads[f];
  fs.writeFileSync(path.join(ROOT, 'gate_data.json'), JSON.stringify(gd, null, 1));

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  server.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
