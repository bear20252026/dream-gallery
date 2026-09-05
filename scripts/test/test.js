// 自动化测试：data.js 数据校验 + 服务器 API 行为 + 安全边界
// 用法: node test.js
// 自带临时测试服务器(端口 3210/3211)，不干扰正在运行的实例，测试后自动清理
// 退出码: 全部通过 0，任一失败 1

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { QUIZ_PASS_SCORE } = require('../../lib/quiz.js'); // 分数线单一源:测试判定跟随服务端常量,不再单独硬编码
let passed = 0, failed = 0;
const children = [];

function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

// 启动一个临时服务器实例，等待就绪
function startServer(port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdout.on('data', d => {
      if (d.toString().includes('服务器已启动')) resolve(`http://localhost:${port}`);
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error(`端口 ${port} 服务器启动超时`)), 10000);
  });
}

// ---------- 1. data.js 数据校验 ----------
async function testData() {
  console.log('\n[data.js 数据校验]');
  const { P, V, AI_DESC, LINKS } = await import(require('url').pathToFileURL(path.join(ROOT, 'data.js')).href);

  ok(Array.isArray(P) && P.length > 0, `照片列表 P 非空 (${P.length} 张)`);
  ok(new Set(P).size === P.length, 'P 无重复条目');
  ok(P.every(p => /^photos\/.+\.(jpe?g|png|webp|gif)$/i.test(p)), 'P 全部是 photos/ 下的图片路径');
  ok(P.every(p => fs.existsSync(path.join(ROOT, p))), 'P 引用的文件全部存在于磁盘');

  ok(Array.isArray(V) && V.length > 0, `视频列表 V 非空 (${V.length} 个)`);
  ok(V.every(v => /^videos\/.+\.(mp4|webm)$/i.test(v)), 'V 全部是 videos/ 下的视频路径');
  // 视频文件可能不在本地仓库中（部署在服务器上），跳过存在性检查
  const vMissing = V.filter(v => !fs.existsSync(path.join(ROOT, v)));
  if (vMissing.length > 0) {
    console.log(`  ⚠ 跳过视频文件存在性检查: ${vMissing.length} 个文件不在本地 (${vMissing.slice(0, 3).join(', ')}${vMissing.length > 3 ? '...' : ''})`);
  }

  ok(AI_DESC.length > 0 && AI_DESC.every(d => typeof d === 'string' && d.length > 0),
    `AI_DESC 全部为非空文案 (${AI_DESC.length} 段)`);

  const keys = Object.keys(LINKS);
  ok(keys.length > 0 && keys.every(k => /^https?:\/\//.test(LINKS[k])), `LINKS 全部是合法 URL (${keys.length} 条)`);

  // LINKS 的 key 必须在 js 代码中被使用(userData 标记),代码里的链接标记也必须在 LINKS 中配置
  const walkSrc = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkSrc(path.join(d, e.name)) : (e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const jsCode = walkSrc(path.join(ROOT, 'src')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  ok(keys.every(k => jsCode.includes(k)), 'LINKS 的每个 key 都在 js 代码中被使用');
  const usedFlags = new Set([...jsCode.matchAll(/userData\s*=\s*\{(isLink\d*|isGarden)\s*:/g)].map(m => m[1]));
  ok([...usedFlags].every(f => LINKS[f]), '代码中的链接标记(isLink*/isGarden)都在 LINKS 中有配置');
}

// ---------- 2. 服务器 API 行为 ----------
// 固定测试 IP:realIP 无条件信任 x-forwarded-for,
// 用稳定 IP 让封禁/拦截断言确定性通过(避免 me.ip 取到回环地址导致时好时坏)
const TEST_IP = '203.0.113.5';
const XFF = { 'x-forwarded-for': TEST_IP };
async function testApi(base) {
  console.log('\n[服务器 API(无鉴权)]');
  // 媒体目录自愈:CI/新环境 checkout 后 videos 可能不存在(git 不跟踪空目录),先确保目录在
  for (const d of ['photos', 'videos', 'music']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  const TEST_NAME = '_test_upload_' + Date.now() + '.jpg';
  const testPath = `${path.join(ROOT, 'photos')}${path.sep}${TEST_NAME}`;

  // 列表
  let res = await fetch(base + '/api/files');
  const all = await res.json();
  ok(res.status === 200 && Array.isArray(all.photos) && Array.isArray(all.videos) && Array.isArray(all.music),
    'GET /api/files 返回三个媒体目录数组');

  res = await fetch(base + '/api/files?dir=bad');
  ok(res.status === 400, 'GET /api/files?dir=bad 返回 400');

  // 上传 → 列表可见 → 删除 → 列表消失
  try {
    res = await fetch(base + '/api/upload?dir=photos&name=' + TEST_NAME, { method: 'POST', body: 'hello-test' });
    ok(res.status === 201 && fs.readFileSync(testPath, 'utf8') === 'hello-test', 'POST 上传文件成功且内容正确');

    // 列表可能异步刷新,轮询最多 3 秒确认文件出现(消除偶发时序竞态)
    let listed = false;
    for (let i = 0; i < 15 && !listed; i++) {
      const list1 = await (await fetch(base + '/api/files?dir=photos')).json();
      if (list1.photos.some(f => f.name === TEST_NAME)) { listed = true; break; }
      await new Promise(r => setTimeout(r, 200));
    }
    ok(listed, '上传后文件出现在列表中');

    res = await fetch(base + '/api/files/photos/' + TEST_NAME, { method: 'DELETE' });
    ok(res.status === 200 && !fs.existsSync(testPath), 'DELETE 删除成功且磁盘文件已移除');
  } finally {
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath); // 测试残留兜底清理
  }

  res = await fetch(base + '/api/upload?dir=bad&name=x.txt', { method: 'POST', body: 'x' });
  ok(res.status === 400, 'POST 上传到非法目录返回 400');
  res = await fetch(base + '/api/upload?dir=photos&name=..%2Fx.txt', { method: 'POST', body: 'x' });
  ok(res.status === 400, 'POST 上传非法文件名(..)返回 400');

  // 静态资源
  res = await fetch(base + '/');
  ok(res.status === 200 && (res.headers.get('content-type') || '').includes('text/html'), 'GET / 返回 HTML');
  res = await fetch(base + '/data.js');
  ok(res.status === 200, 'GET /data.js 返回 200');
  res = await fetch(base + '/nonexistent.png');
  ok(res.status === 404, 'GET 不存在的文件返回 404');

  // Range 请求(视频拖动进度条依赖)
  res = await fetch(base + '/music/background.mp3', { headers: { Range: 'bytes=0-99' } });
  const buf = await res.arrayBuffer();
  ok(res.status === 206 && buf.byteLength === 100, 'Range 请求返回 206 且长度正确');
}

// ---------- 3. 安全边界 ----------
async function testSecurity(base) {
  console.log('\n[安全边界]');
  const res = await fetch(base + '/api/files/photos/..%2Fserver.js', { method: 'DELETE' });
  ok(res.status === 400 && fs.existsSync(path.join(ROOT, 'server.js')), 'DELETE 路径穿越被拒绝且 server.js 完好');

  const res2 = await fetch(base + '/..%2Fserver.js');  ok(res2.status === 403 || res2.status === 404, '静态路径穿越被拒绝');

  // src/ 可读源码(2026-07-26 封堵):公网 Host 一律 404,localhost 放行(本地开发依赖)
  const hostHeaderStatus = await new Promise(resolve => {
    const u = new URL(base);
    const q = require('http').request({ host: u.hostname, port: u.port, path: '/src/main.js', headers: { host: 'cloudbear.cloud' } }, r2 => { r2.resume(); r2.on('end', () => resolve(r2.statusCode)); });
    q.on('error', () => resolve(0)); q.end();
  });
  ok(hostHeaderStatus === 404, '公网访问 src/ 源码返回 404(防窃取)');
  const resJsLocal = await fetch(base + '/src/main.js');
  ok(resJsLocal.status === 200, 'localhost 访问 src/ 正常(开发入口不受影响)');

  // 协议文档编辑器(2026-07-27):无 token 401
  let dres = await fetch(base + '/api/admin/docs?file=agreement.html');
  ok(dres.status === 401, '文档接口无 token 返回 401');
  dres = await fetch(base + '/admin/docs');
  ok(dres.status === 401, '编辑器页面无 token 返回 401');
}

// ---------- 4. TOKEN 鉴权 ----------
async function testToken(base) {
  console.log('\n[TOKEN 鉴权]');
  let res = await fetch(base + '/api/files');
  ok(res.status === 200, '文件列表公开只读(无需 token)');
  // TOKEN 管非公开目录(music);photos/videos 已改为公开上传(2026-07-25 新规)
  res = await fetch(base + '/api/upload?dir=music&name=x.txt', { method: 'POST', body: 'x' });
  ok(res.status === 401, '无 token 上传 music 返回 401');
  res = await fetch(base + '/api/upload?dir=music&name=x.txt&token=wrong', { method: 'POST', body: 'x' });
  ok(res.status === 401, '错误 token 返回 401');
  res = await fetch(base + '/api/upload?dir=music&name=x.txt&token=t1', { method: 'POST', body: 'x' });
  ok(res.status === 201, '正确 token(query)可上传');
  res = await fetch(base + '/api/files/music/x.txt', { method: 'DELETE', headers: { 'x-token': 't1' } });
  ok(res.status === 200, '正确 token(x-token 头)可删除');
  res = await fetch(base + '/api/upload?dir=photos&name=pub_t1.jpg', { method: 'POST', body: 'x' });
  ok(res.status === 201, 'photos 公开上传无需 token(新规则)');
  await fetch(base + '/api/files/photos/pub_t1.jpg', { method: 'DELETE', headers: { 'x-token': 't1' } });
  res = await fetch(base + '/api/upload?dir=videos&name=pub_v1.mp4', { method: 'POST', body: 'x' });
  ok(res.status === 201, 'videos 公开上传无需 token(新规则)');
  await fetch(base + '/api/files/videos/pub_v1.mp4', { method: 'DELETE', headers: { 'x-token': 't1' } });
  res = await fetch(base + '/api/upload?dir=photos&name=x.txt', { method: 'POST', body: 'x' });
  ok(res.status === 400, '公开上传拒绝非媒体文件');

  // 媒体文件级门禁(2026-07-26 紧急堵口):普通用户仅 演示照片/白板/户外大屏/本人上传
  const uaB = { headers: { 'user-agent': 'perm-test-B' } };
  res = await fetch(base + '/api/upload?dir=photos&name=perm-a.png', { method: 'POST', headers: { 'user-agent': 'perm-test-A' }, body: 'fakepng' });
  ok(res.status === 201, '媒体门禁前置:A 上传成功');
  res = await fetch(base + '/photos/perm-a.png', { headers: { 'user-agent': 'perm-test-A' } });
  ok(res.status === 200, '本人上传:本人可访问');
  res = await fetch(base + '/photos/perm-a.png', uaB);
  ok(res.status === 403, '本人上传:他人访问 403');
  res = await fetch(base + '/photos/1000000850.jpg', uaB);
  ok(res.status === 403, '图库照片:普通用户 403');
  // 户外大屏视频可能不在本地仓库中，跳过检查
  const outdoorVideoPath = path.join(ROOT, 'videos', '户外大屏', '户外大屏1号.mp4');
  if (fs.existsSync(outdoorVideoPath)) {
    res = await fetch(base + encodeURI('/videos/户外大屏/户外大屏1号.mp4'), { headers: { 'user-agent': 'perm-test-B', range: 'bytes=0-0' } });
    ok(res.status === 206 || res.status === 200, '户外大屏:全员公开');
  } else {
    console.log('  ⚠ 跳过户外大屏测试:视频文件不在本地');
  }
  // 演示照片机制:后台标记后可公开访问,取消后回到 403
  await fetch(base + '/api/admin/demo?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: '201.jpg', demo: true }) });
  res = await fetch(base + '/photos/201.jpg', uaB);
  ok(res.status === 200, '演示照片:标记后普通用户可访问');
  await fetch(base + '/api/admin/demo?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: '201.jpg', demo: false }) });
  res = await fetch(base + '/photos/201.jpg', uaB);
  ok(res.status === 403, '演示照片:取消标记后恢复 403');
  res = await fetch(base + '/api/files?dir=photos', uaB);
  const fl = await res.json();
  ok(!(fl.photos || []).some(f => f.name === '1000000850.jpg' || f.name === 'perm-a.png'), '无 token 文件列表已按权限过滤');
  res = await fetch(base + '/api/files?dir=photos&token=t1');
  const fl2 = await res.json();
  ok((fl2.photos || []).length > (fl.photos || []).length, '带 token 文件列表为全量');
  await fetch(base + '/api/files/photos/perm-a.png?token=t1', { method: 'DELETE' }); // 清理

  // 协议文档编辑器(2026-07-27):白名单;读写+备份+回滚
  let dres = await fetch(base + '/api/admin/docs?file=server.js&token=t1');
  ok(dres.status === 400, '文档接口白名单拦截非协议文件');
  dres = await fetch(base + '/api/admin/docs?file=agreement.html&token=t1');
  const docGet = await dres.json();
  ok(dres.status === 200 && docGet.content.includes('<html'), '文档读取成功(用户协议)');
  const docBackup = docGet.content;
  dres = await fetch(base + '/api/admin/docs?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: 'agreement.html', content: docBackup + '\n<!-- editor-test-marker -->' }) });
  const docSave = await dres.json();
  ok(dres.status === 200 && typeof docSave.backup === 'string', '文档保存成功并自动备份');
  dres = await fetch(base + '/api/admin/docs?file=agreement.html&token=t1');
  ok((await dres.json()).content.includes('editor-test-marker'), '保存后内容即时生效');
  dres = await fetch(base + '/api/admin/docs?backups=agreement.html&token=t1');
  ok((await dres.json()).backups.length >= 1, '备份列表可查');
  dres = await fetch(base + '/api/admin/docs?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: 'agreement.html', restore: docSave.backup }) });
  ok(dres.status === 200, '备份回滚成功');
  dres = await fetch(base + '/api/admin/docs?file=agreement.html&token=t1');
  ok((await dres.json()).content === docBackup, '回滚后内容与原文件一致');
  res = await fetch(base + '/');
  ok(res.status === 200, '静态资源不受鉴权影响');
}

// ---------- 5+6. 入口守卫:自由进 + 踢出→申请→批准 + 统计过滤 ----------
// 2026-08-30 权限精简:唯一管理动作=踢出;被踢设备重进须申请;自动化流量不计统计
const VISITOR_UA = 'Mozilla/5.0 (Linux; Android 14) VisitorCheck/1.0'; // 不含黑名单词,模拟真实访客
async function testEntryFlow(base) {
  console.log('\n[入口守卫与踢出流]');
  const jar = {};
  function saveCookies(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of sc) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  }
  function ch() { return Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '); }
  const H = () => ({ 'user-agent': VISITOR_UA, 'x-forwarded-for': TEST_IP, cookie: ch() });

  // 1. 自由进:无任何 Cookie 直接进画廊
  let res = await fetch(base + '/', { headers: { 'user-agent': VISITOR_UA, 'x-forwarded-for': TEST_IP } });
  let body = await res.text();
  ok(res.status === 200 && !body.includes('重新进入申请'), '无 Cookie 自由进入画廊(不落申请页)');
  saveCookies(res);

  // 2. 指纹采集归并
  res = await fetch(base + '/api/entry/collect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': VISITOR_UA, 'x-forwarded-for': TEST_IP, cookie: ch() }, body: JSON.stringify({ lid: 'test-lid-1', fp: { scr: '390x844x3', canvas: 'abc1', webgl: 'GPU Test', audio: '1.23' } }) });
  ok(res.status === 200, '指纹采集归并成功');

  // 3. 后台可见访客(自由进自动建档)
  let list = await (await fetch(base + '/api/admin/list?token=t1')).json();
  const me = list.applicants.find(a => a.id === jar.vid);
  ok(!!me && me.status === 'approved', '访客自动建档并放行');

  // 4. 管理操作需 token
  res = await fetch(base + '/api/admin/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok(res.status === 401, '管理操作无 token 返回 401');

  // 5. 踢出 → 访问落到申请页 + 踢出历史记录
  res = await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'kick', reason: '测试踢出' }) });
  ok(res.status === 200, '踢出操作成功');
  res = await fetch(base + '/', { headers: H() });
  body = await res.text();
  ok(body.includes('重新进入申请'), '被踢出后访问落到重新进入申请页');
  list = await (await fetch(base + '/api/admin/list?token=t1')).json();
  ok((list.kickLog || []).some(k => k.id === jar.vid && k.reason === '测试踢出'), '踢出历史已记录');

  // 6. 提交重进申请 → 等待页
  res = await fetch(base + '/api/entry/reapply', { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': VISITOR_UA, 'x-forwarded-for': TEST_IP, cookie: ch() }, body: JSON.stringify({ msg: '求放行' }) });
  const ra = await res.json();
  ok(ra.status === 'reapply', '重进申请已提交');
  res = await fetch(base + '/', { headers: H() });
  ok((await res.text()).includes('申请已提交'), '待批状态落到等待页');

  // 7. 批准 → 恢复放行
  await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'approve' }) });
  res = await fetch(base + '/', { headers: H() });
  body = await res.text();
  ok(res.status === 200 && !body.includes('重新进入申请'), '批准后恢复放行');

  // 8. 强信号绕过拦截:重新踢出后,换 UA+清 Cookie 的新档案上报同一持久 ID → deny
  await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'kick', reason: '绕过测试' }) });
  res = await fetch(base + '/', { headers: { 'user-agent': VISITOR_UA + 'X', 'x-forwarded-for': '198.51.100.7' } });
  for (const k of Object.keys(jar)) delete jar[k];
  saveCookies(res);
  res = await fetch(base + '/api/entry/collect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': VISITOR_UA + 'X', 'x-forwarded-for': '198.51.100.7', cookie: ch() }, body: JSON.stringify({ lid: 'test-lid-1', fp: { scr: '390x844x3', canvas: 'abc1' } }) });
  const cd = await res.json();
  ok(cd.deny === true, '清Cookie换UA后持久ID命中踢出档案 → deny');
  // 恢复被拦档案放行,避免影响后续用例
  list = await (await fetch(base + '/api/admin/list?token=t1')).json();
  for (const a of list.applicants.filter(a => a.status === 'kicked')) {
    await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, action: 'approve' }) });
  }

  // 9. 统计过滤:Headless UA 与 x-probe/无UA 不计数
  const before = (await (await fetch(base + '/api/admin/list?token=t1')).json()).stats.total;
  await fetch(base + '/', { headers: { 'user-agent': 'HeadlessChrome/120' } });
  await fetch(base + '/', { headers: { 'x-probe': '1', 'user-agent': 'Mozilla/5.0 RealUA' } });
  await fetch(base + '/', { headers: {} });
  let after = (await (await fetch(base + '/api/admin/list?token=t1')).json()).stats.total;
  ok(before === after, 'Headless/x-probe/无UA 访问不计入统计');

  // 10. 真实 UA 计数(不同 UA 避开 60 秒同设备去重)
  await fetch(base + '/', { headers: { 'user-agent': 'VisitorCheck-B/1.0', 'x-forwarded-for': '198.51.100.9' } });
  after = (await (await fetch(base + '/api/admin/list?token=t1')).json()).stats.total;
  ok(after > before, '真实 UA 访问正常计数');

  // 11. 拉黑 IP(反刷)拦截 + 解除
  await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'block', ip: '198.51.100.9' }) });
  res = await fetch(base + '/', { headers: { 'user-agent': VISITOR_UA, 'x-forwarded-for': '198.51.100.9' } });
  ok((await res.text()).includes('暂时无法参观'), '拉黑 IP 后被拦截');
  await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unblock', ip: '198.51.100.9' }) });

  // 12. 未知操作返回 400(权限精简生效)
  res = await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'vip' }) });
  ok(res.status === 400, '旧权限操作(VIP)已被移除(400)');

  // 13. SSE 踢出推送:kick 事件即时可达
  {
    const ctrl = new AbortController();
    const sseRes = await fetch(base + '/api/entry/watch', { headers: { 'user-agent': VISITOR_UA }, signal: ctrl.signal });
    ok((sseRes.headers.get('content-type') || '').includes('text/event-stream'), 'SSE 踢出通道可连接');
    const reader = sseRes.body.getReader();
    let got = '';
    const readP = (async () => {
      try { while (true) { const { done, value } = await reader.read(); if (done) break; got += new TextDecoder().decode(value); } } catch (e) {}
    })();
    await new Promise(r => setTimeout(r, 300));
    list = await (await fetch(base + '/api/admin/list?token=t1')).json();
    const meAgain = list.applicants.find(a => a.ua === VISITOR_UA) || list.applicants[0];
    await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: meAgain.id, action: 'kick', reason: 'SSE测试' }) });
    await new Promise(r => setTimeout(r, 1500));
    ctrl.abort();
    await readP;
    ok(got.includes('kick'), '踢出后 SSE 即时推送 kick 事件');
    await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: meAgain.id, action: 'approve' }) });
  }
}
// ---------- 7. 答题进馆系统 ----------
async function testQuiz(base) {
  console.log('\n[答题系统]');
  // 出卷:理科
  let res = await fetch(base + '/api/quiz/start?track=li');
  let d = await res.json();
  ok(res.status === 200 && Array.isArray(d.mc) && d.mc.length === 9 && d.qa && d.qa.q, '理科出卷:9选择+1问答');
  ok(d.mc.every(m => m.options && m.options.A && m.options.B && m.options.C && m.options.D), '每题均有ABCD四个选项');
  ok(!JSON.stringify(d).includes('correctLetter'), '出卷响应不泄露正确答案');
  ok(d.passScore === QUIZ_PASS_SCORE, '出卷响应下发分数线(前端单一源)');
  res = await fetch(base + '/api/quiz/start?track=bad');
  ok(res.status === 400, '非法 track 返回 400');

  // 提交:全部选A + 短问答 → 会话评分
  const sid = d.sessionId;
  res = await fetch(base + '/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, answers: Array(9).fill('A'), qaText: '太短了' }) });
  const g = await res.json();
  ok(res.status === 200 && typeof g.total === 'number' && g.total === g.mcScore + g.qaScore, '提交后返回完整评分(选择+问答=总分)');
  ok(g.qaScore === 0 && g.passed === (g.total >= QUIZ_PASS_SCORE), '问答不足25字记0分;达标线判定跟随服务端常量(当前 ' + QUIZ_PASS_SCORE + ' 分)');
  ok(Array.isArray(g.review) && g.review.length === 9, '返回逐题对错回顾');
  ok(!JSON.stringify(g.review).includes('"correct"') && !JSON.stringify(g.review).includes('correctLetter'), '提交响应不泄露正确答案(仅存底层)');
  // 会话一次性:重复提交被拒
  res = await fetch(base + '/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, answers: Array(9).fill('A'), qaText: 'x' }) });
  ok(res.status === 400, '一次性会话:重复提交返回 400');

  // 本地评分细则:长答案应得分且给出分项明细
  res = await fetch(base + '/api/quiz/start?track=wen');
  d = await res.json();
  const longText = '因为'.repeat(150); // 300字,含论证词
  res = await fetch(base + '/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d.sessionId, answers: Array(9).fill('B'), qaText: longText }) });
  const g2 = await res.json();
  ok(g2.qaScore > 0 && g2.qaBy === 'rubric', '评分细则对长答案给分: ' + g2.qaScore + '分');
  ok(Array.isArray(g2.qaBreakdown) && g2.qaBreakdown.length >= 3, '评分返回分项细则(篇幅/结构/论证/切题)');

  // 状态查询
  res = await fetch(base + '/api/quiz/state');
  const st = await res.json();
  ok(typeof st.passed === 'boolean', '答题状态接口返回 passed 布尔值');
  ok(st.passScore === QUIZ_PASS_SCORE, '状态接口下发分数线(前端单一源,当前 ' + QUIZ_PASS_SCORE + ')');

  // 逐题批改(2026-07-26):判对错不泄露正解;同题锁死;判后提交不受影响
  res = await fetch(base + '/api/quiz/start?track=li');
  d = await res.json();
  res = await fetch(base + '/api/quiz/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d.sessionId, qIndex: 0, letter: 'A' }) });
  const j1 = await res.json();
  ok(res.status === 200 && typeof j1.right === 'boolean' && !('correctLetter' in j1), '逐题批改返回布尔且不泄露正解');
  res = await fetch(base + '/api/quiz/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d.sessionId, qIndex: 0, letter: 'B' }) });
  ok(res.status === 409, '同题重复批改返回 409(判过锁定)');
  res = await fetch(base + '/api/quiz/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'no-such-session', qIndex: 0, letter: 'A' }) });
  ok(res.status === 400, '非法会话批改返回 400');
  res = await fetch(base + '/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d.sessionId, answers: Array(9).fill('A'), qaText: '因为'.repeat(150) }) });
  ok(res.status === 200, '逐题批改后提交试卷不受影响');

  // 神话卷(2026-07-26):出卷含神话题;判题下发正解+解析;提交附问答题解析
  res = await fetch(base + '/api/quiz/start?track=shen');
  const sh = await res.json();
  ok(res.status === 200 && sh.mc.length === 9 && sh.qa && sh.qa.q, '神话卷出卷:9选择+1问答');
  ok(!JSON.stringify(sh).includes('correctLetter') && !JSON.stringify(sh).includes('explain'), '神话卷出卷不预泄正解与解析');
  res = await fetch(base + '/api/quiz/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sh.sessionId, qIndex: 0, letter: 'A' }) });
  const shj = await res.json();
  ok(res.status === 200 && typeof shj.right === 'boolean' && typeof shj.correctLetter === 'string' && typeof shj.explain === 'string', '神话卷判题下发正解+解析(仅此卷)');
  res = await fetch(base + '/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sh.sessionId, answers: Array(9).fill('A'), qaText: '因为'.repeat(150) }) });
  const shg = await res.json();
  ok(res.status === 200 && typeof shg.qaExplain === 'string' && shg.qaExplain.length > 10 && shg.review.every(r => typeof r.correctLetter === 'string'), '神话卷成绩单:逐题正解+问答题解析');
  // 文理卷不得下发正解(防线不回退)
  res = await fetch(base + '/api/quiz/start?track=li');
  d = await res.json();
  res = await fetch(base + '/api/quiz/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d.sessionId, qIndex: 0, letter: 'A' }) });
  const lj = await res.json();
  ok(!('correctLetter' in lj) && !('explain' in lj), '文理卷判题仍不下发正解(防线不回退)');
  await fetch(base + '/api/quiz/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: d.sessionId, answers: Array(9).fill('A'), qaText: '因为'.repeat(150) }) });

  // 聊天室(2026-07-26):发言/拉取/me 标记/限流/字数
  res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '测试发言-昆仑' }) });
  ok(res.status === 200, '聊天发言成功');
  res = await fetch(base + '/api/chat');
  const chat = await res.json();
  const lastMsg = (chat.msgs || [])[chat.msgs.length - 1];
  ok(lastMsg && lastMsg.t === '测试发言-昆仑' && lastMsg.me === true && typeof lastMsg.n === 'string', '聊天拉取:含本人发言且 me 标记正确');
  res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '连发第二条' }) });
  ok(res.status === 429, '聊天 3 秒限流生效');
  res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(141) }) });
  ok(res.status === 400, '聊天 140 字上限拦截');

  // TTS 代理(2026-07-26):空文案 400;合成返回音频或优雅失败(本机无 edge-tts 时 502,不得 500 崩掉)
  res = await fetch(base + '/api/tts');
  ok(res.status === 400, 'TTS 空文案返回 400');
  res = await fetch(base + '/api/tts?text=' + encodeURIComponent('昆仑会唱歌'));
  ok([200, 502].includes(res.status), 'TTS 合成返回音频或优雅失败(不崩进程): ' + res.status);
}

(async () => {
  // 数据隔离:备份并恢复 gate_data.json,防止本地数据(含真实访客)污染断言
  const GATE_FILE = path.join(ROOT, 'gate_data.json');
  const GATE_BAK = GATE_FILE + '.testbak';
  let hadGate = false;
  try {
    if (fs.existsSync(GATE_FILE)) { fs.copyFileSync(GATE_FILE, GATE_BAK); hadGate = true; }
  } catch (e) {}
  try {
    await testData();
    const base1 = await startServer(3210);
    await testApi(base1);
    await testSecurity(base1);
    const base2 = await startServer(3211, { TOKEN: 't1' });
    await testToken(base2);
    const base4 = await startServer(3212, { TOKEN: 't1' });

    const base5 = await startServer(3214, { AI_GRADE_API_KEY: '', AI_GRADE_API_KEY_BACKUP: '', MIMO_API_KEY: '', MIMO_TP_API_KEY: '' }); // 屏蔽真实 AI key:评分测试必须确定性地走本地细则
    await testEntryFlow(base4);
    await testQuiz(base5);
  } catch (e) {
    failed++;
    console.error('\n测试执行异常: ' + e.message + ' | cause: ' + ((e.cause && (e.cause.code || e.cause.message)) || '无'));
  } finally {
    children.forEach(c => c.kill());
    try {
      if (hadGate) fs.copyFileSync(GATE_BAK, GATE_FILE);
      else if (fs.existsSync(GATE_FILE)) fs.unlinkSync(GATE_FILE);
      if (fs.existsSync(GATE_BAK)) fs.unlinkSync(GATE_BAK);
    } catch (e) {}
  }
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
