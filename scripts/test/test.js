// 自动化测试：data.js 数据校验 + 服务器 API 行为 + 安全边界
// 用法: node test.js
// 自带临时测试服务器(端口 3210/3211)，不干扰正在运行的实例，测试后自动清理
// 退出码: 全部通过 0，任一失败 1

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { QUIZ_PASS_SCORE } = require(path.join(ROOT, 'lib', 'quiz.js')); // 分数线单一源:测试判定跟随服务端常量,不再单独硬编码
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
  ok(V.every(v => fs.existsSync(path.join(ROOT, v))), 'V 引用的文件全部存在于磁盘');

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
async function testApi(base) {
  console.log('\n[服务器 API(无鉴权)]');
  const TEST_NAME = '_test_upload_' + Date.now() + '.jpg';
  const testPath = path.join(ROOT, 'photos', TEST_NAME);

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

    const list1 = await (await fetch(base + '/api/files?dir=photos')).json();
    ok(list1.photos.some(f => f.name === TEST_NAME), '上传后文件出现在列表中');

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
  res = await fetch(base + encodeURI('/videos/户外大屏/户外大屏1号.mp4'), { headers: { 'user-agent': 'perm-test-B', range: 'bytes=0-0' } });
  ok(res.status === 206 || res.status === 200, '户外大屏:全员公开');
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

// ---------- 5. 领取邀请函 ----------
async function testGate(base) {
  console.log('\n[领取邀请函]');
  let res = await fetch(base + '/');
  let body = await res.text();
  ok(body.includes('领取邀请函'), '无 Cookie 访问主页被拦到领取邀请函');
  res = await fetch(base + '/data.js');
  body = await res.text();
  ok(body.includes('领取邀请函'), '无 Cookie 访问 js 文件也被拦截');
  res = await fetch(base + '/api/files');
  ok(res.status === 200, '/api 不受领取邀请函影响');
  res = await fetch(base + '/api/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: '错误答案' }) });
  ok(res.status === 401, '答错返回 401');
  res = await fetch(base + '/api/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: '测试答案' }) });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  ok(res.status === 200 && cookie.startsWith('gate='), '答对返回 200 并种 Cookie');
  res = await fetch(base + '/', { headers: { cookie } });
  body = await res.text();
  ok(res.status === 200 && !body.includes('领取邀请函'), '带 Cookie 能访问到真正主页');
  res = await fetch(base + '/', { headers: { cookie: 'gate=forged' } });
  body = await res.text();
  ok(body.includes('领取邀请函'), '伪造 Cookie 被拦截');
}

// ---------- 6. 审批门(申请→审批→通行证→统计) ----------
async function testApproval(base) {
  console.log('\n[审批门]');
  const jar = {}; // 简易 cookie 罐
  function saveCookies(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of sc) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  }
  function cookieHeader() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }

  // 1. 无通行证 → 邀请函页(新规:开启即放行,无输入环节)
  let res = await fetch(base + '/');
  ok(res.status===200&&(await res.text()).includes('梦幻画廊'), '无通行证也可直接进馆(无邀请函页新规)');

  // 2. 开启邀请函 → 自动放行(2026-07-25 新规:无需后台同意)
  res = await fetch(base + '/api/gate/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: '测试访客小明' }) });
  saveCookies(res);
  const st0 = res.status === 200 ? await res.clone().json().catch(() => ({})) : {};
  ok(res.status === 200 && jar.vid, '开启邀请函成功并种下 vid');

  // 3. 状态=approved 且可进入(自动放行)
  res = await fetch(base + '/api/gate/status', { headers: { cookie: cookieHeader() } });
  const st1 = await res.json();
  ok(st1.status === 'approved' && st1.enter === true, '开启后立即获得进入权限');
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  ok(!(await res.text()).includes('开启邀请函'), '开启后直达真正首页');

  // 4. 后台需 token
  res = await fetch(base + '/api/admin/list');
  ok(res.status === 401, '后台列表无 token 返回 401');
  res = await fetch(base + '/admin');
  ok(res.status === 401, '后台页面无 token 返回 401');

  // 5. 后台列表可见访客(新规:状态直接是 approved)
  res = await fetch(base + '/api/admin/list?token=t1');
  const list = await res.json();
  const me = list.applicants.find(a => a.id === jar.vid);
  ok(!!me && me.status === 'approved' && me.answer === '测试访客小明', '后台能看到访客记录');

  // 6. 审批操作需 token
  res = await fetch(base + '/api/admin/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'perm' }) });
  ok(res.status === 401, '审批操作无 token 返回 401');

  // 7. 永久批准 → 轮询补发通行证 → 可进入
  res = await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'perm' }) });
  ok(res.status === 200, '永久批准操作成功');
  res = await fetch(base + '/api/gate/status', { headers: { cookie: cookieHeader() } });
  saveCookies(res);
  const st2 = await res.json();
  ok(st2.enter === true && !!jar.pass, '批准后状态接口补发通行证');
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  const home = await res.text();
  ok(res.status === 200 && !home.includes('领取邀请函'), '持通行证可访问真正首页');

  // 8. 访问统计生效
  res = await fetch(base + '/api/admin/list?token=t1');
  const list2 = await res.json();
  const me2 = list2.applicants.find(a => a.id === jar.vid);
  ok(list2.stats.total >= 1 && me2.visits >= 1, '访问统计已计数(总数+个人)');
  ok(Array.isArray(list2.visits) && list2.visits.some(v => v.id === jar.vid), '访问日志按设备记录');
  ok(!!me2.brand, '设备品牌已解析: ' + me2.brand);

  // 9. 撤销批准 → 归入历史,通行证立即失效
  res = await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'revoke' }) });
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  ok((await res.text()).includes('暂时无法参观'), '撤销批准后通行证立即失效');
  res = await fetch(base + '/api/admin/list?token=t1');
  ok((await res.json()).applicants.find(a => a.id === jar.vid).status === 'history', '撤销后归入历史(不回待批准)');

  // 10. 拒绝 → 显示重申通道(任何用户都有权重新领取邀请函)
  res = await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'deny' }) });
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  ok((await res.text()).includes('暂时无法参观'), '被拒绝后提供重新申请通道');

  // 15. 链接点击埋点 → 后台可见 → 导出 xlsx(PK) → 批量清理
  res = await fetch(base + '/api/track/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: 'isLink5', url: 'https://example.com', pos: { x: 1, y: 2, z: 3 }, fp: { scr: '390x844x3', tz: -480, lang: 'zh-CN', canvas: 'abc123' } }) });
  ok(res.status === 200, '点击埋点接口可用');
  res = await fetch(base + '/api/admin/list?token=t1');
  const dl = await res.json();
  ok(Array.isArray(dl.linkClicks) && dl.linkClicks.some(c => c.link === 'isLink5'), '后台能看到点击记录(含指纹)');
  res = await fetch(base + '/api/admin/export.xlsx?token=t1');
  const xbuf = Buffer.from(await res.arrayBuffer());
  ok(res.status === 200 && xbuf.length > 100 && xbuf[0] === 0x50 && xbuf[1] === 0x4b, '导出 xlsx 是合法 ZIP/Excel 包');
  res = await fetch(base + '/api/admin/export.xlsx');
  ok(res.status === 401, '导出接口无 token 返回 401');
  res = await fetch(base + '/api/admin/clicks/clear?token=t1', { method: 'POST' });
  ok(res.status === 200, '批量清理点击记录成功');

  // 16. 反刷存储预警:连传 9 个文件触发速率预警 → 后台可见 → 忽略 → 封 IP 可解除
  for (let i = 0; i < 9; i++) {
    await fetch(base + '/api/upload?dir=photos&name=abuse_' + i + '.jpg', { method: 'POST', body: 'x' });
  }
  res = await fetch(base + '/api/admin/list?token=t1');
  const al = await res.json();
  ok(Array.isArray(al.alerts) && al.alerts.some(a => a.type === 'rate'), '刷盘速率触发预警');
  const rateIdx = al.alerts.findIndex(a => a.type === 'rate');
  res = await fetch(base + '/api/admin/alerts?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss', idx: rateIdx }) });
  ok(res.status === 200, '忽略单条预警成功');
  const myIp2 = me.ip;
  res = await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'block', ip: myIp2 }) });
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  ok((await res.text()).includes('已被拉黑'), '预警封 IP 立即生效');
  res = await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unblock', ip: myIp2 }) });
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  ok(res.status === 200 && !(await res.text()).includes('已被拉黑'), '解除封禁后恢复访问(防误封)');
  for (let i = 0; i < 9; i++) { await fetch(base + '/api/files/photos/abuse_' + i + '.jpg?token=t1', { method: 'DELETE' }); }

  // 17. 备注
  res = await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'note', note: '测试备注' }) });
  res = await fetch(base + '/api/admin/list?token=t1');
  ok((await res.json()).applicants.find(a => a.id === jar.vid).note === '测试备注', '设备备注已保存');

  // 16. 关注/拉黑 IP
  const myIp = me.ip;
  res = await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'watch', ip: myIp }) });
  res = await fetch(base + '/api/admin/list?token=t1');
  ok((await res.json()).watch.includes(myIp), '设为重点关注生效');
  await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unwatch', ip: myIp }) });
  res = await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'block', ip: myIp }) });
  res = await fetch(base + '/api/gate/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: 'x' }) });
  ok(res.status === 403, '拉黑 IP 后申请被拒绝');
  res = await fetch(base + '/', { headers: { cookie: cookieHeader() } });
  ok((await res.text()).includes('已被拉黑'), '拉黑 IP 后访问被拦截');
  await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unblock', ip: myIp }) });

  // 17. 一键撤销全部批准
  await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jar.vid, action: 'perm' }) });
  res = await fetch(base + '/api/admin/bulk?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke_all' }) });
  const ra = await res.json();
  res = await fetch(base + '/api/admin/list?token=t1');
  const afterAll = await res.json();
  ok(ra.count >= 1 && afterAll.applicants.every(a => a.status !== 'approved'), '一键撤销全部批准(全部归入历史)');

  // 18. 无 Cookie 场景(模拟 App 内置浏览器):状态接口必须靠设备指纹给出明确状态
  // 撤销后:enter 必须为 false(踢出判断依赖它,不能是 undefined)
  res = await fetch(base + '/api/gate/status'); // 不带任何 Cookie
  const kick = await res.json();
  ok(kick.enter === false && kick.status === 'history', '无Cookie撤销后状态明确为可踢出(enter=false)');
  // 拒绝后:无 Cookie 也能拿到 denied(等待页不再卡死)
  await fetch(base + '/api/gate/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: '无cookie访客' }) });
  const list4 = await (await fetch(base + '/api/admin/list?token=t1')).json();
  const me3 = list4.applicants.find(a => a.ip === me.ip);
  await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: me3.id, action: 'deny' }) });
  res = await fetch(base + '/api/gate/status'); // 不带 Cookie
  const den = await res.json();
  ok(den.status === 'denied' && den.enter === false, '无Cookie被拒绝后状态为denied(等待页可跳转)');

  // 19. SSE 秒级踢出:审批动作应即时推送 recheck
  {
    const ctrl = new AbortController();
    const sseRes = await fetch(base + '/api/gate/watch', { signal: ctrl.signal });
    ok((sseRes.headers.get('content-type') || '').includes('text/event-stream'), 'SSE 踢出通道可连接');
    const reader = sseRes.body.getReader();
    let got = '';
    const readP = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          got += new TextDecoder().decode(value);
        }
      } catch (e) { /* abort 正常结束 */ }
    })();
    await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: me3.id, action: 'perm' }) });
    await new Promise(r => setTimeout(r, 1500));
    ctrl.abort();
    await readP;
    ok(got.includes('recheck'), '审批操作后 SSE 即时推送(秒级踢出)');
    // 恢复为拒绝状态,避免影响后续用例
    await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: me3.id, action: 'deny' }) });
  }

  // 11. 伪造通行证被拦
  res = await fetch(base + '/', { headers: { cookie: `vid=x;pass=${jar.vid}.forgedsig` } });
  ok((await res.text()).includes('暂时无法参观'), '伪造通行证被拦截');

  // 12. 设备归组:同 IP+UA 换名字申请 → 同一条记录(被撤销/拒绝后回到 pending)
  res = await fetch(base + '/api/gate/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: '改名后的张三' }) });
  res = await fetch(base + '/api/admin/list?token=t1');
  const list3 = await res.json();
  const sameDev = list3.applicants.filter(a => a.ip === me.ip);
  ok(sameDev.length === 1 && sameDev[0].answer === '改名后的张三' && sameDev[0].status === 'approved', '同设备换名申请归并为一条记录');

  // 13. 无 Cookie 设备兜底:批准后,不带任何 Cookie 也能进入(模拟 App 内置浏览器)
  await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sameDev[0].id, action: 'perm' }) });
  res = await fetch(base + '/'); // 完全不带 Cookie
  ok(res.status === 200 && !(await res.text()).includes('领取邀请函'), '无任何 Cookie 时设备指纹兜底放行');
  // 清理:拒绝该设备,避免影响其他测试
  await fetch(base + '/api/admin/decide?token=t1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sameDev[0].id, action: 'deny' }) });
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
    const base3 = await startServer(3212, { GATE_ANSWER: '测试答案' });
    await testGate(base3);
    const base4 = await startServer(3213, { GATE_MODE: 'approval', TOKEN: 't1' });
    await testApproval(base4);
    const base5 = await startServer(3214, { AI_GRADE_API_KEY: '', AI_GRADE_API_KEY_BACKUP: '', MIMO_API_KEY: '', MIMO_TP_API_KEY: '' }); // 屏蔽真实 AI key:评分测试必须确定性地走本地细则
    await testQuiz(base5);
  } catch (e) {
    failed++;
    console.error('\n测试执行异常: ' + e.message);
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
