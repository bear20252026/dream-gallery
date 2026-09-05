// 会话机制回归测试: node scripts/test/test-session.js
// 不触碰真实 gate_data.json —— 通过 GATE_DATA_FILE 指向系统临时目录下的文件。
// 覆盖:惰性补发 / 老档案兼容 / 滑动续期 / 过期失效 / 吊销与换发 / ownerAid 会话校验。
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
const tmpFile = path.join(tmpDir, 'gate_data.json');
process.env.GATE_DATA_FILE = tmpFile; // 必须在 require store 之前设置

const store = require('../../lib/store.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

(async () => {
  console.log('[vid 会话机制]');

  // 造一个访客档案
  const ID = 'sess01';
  store.gateData.applicants[ID] = {
    answer: '测试访客', ua: 'TestUA', dk: 'dk-sess01', status: 'approved',
    applyTime: Date.now(), lastAccess: Date.now(),
  };

  // 1. 老档案无 sess → 迁移兼容视为有效
  ok(store.sessionValid(store.gateData.applicants[ID]) === true,
    '老档案无会话记录视为有效(迁移兼容,不批量失效)');

  // 2. touchSession 惰性补发会话并持久化
  store.touchSession(store.gateData.applicants[ID]);
  await store.saveGateData();
  const s1 = store.gateData.applicants[ID].sess;
  ok(s1 && s1.issuedAt > 0 && s1.expiresAt > Date.now(),
    'touchSession 惰性补发会话(30 天有效期)');
  const disk = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  ok(!!(disk.applicants[ID] && disk.applicants[ID].sess),
    '会话已持久化到磁盘');

  // 3. 滑动续期:1 小时节流内不重复写盘,lastSeen 不变
  const ls = s1.lastSeen;
  store.touchSession(store.gateData.applicants[ID]);
  ok(store.gateData.applicants[ID].sess.lastSeen === ls,
    '1 小时节流内重复访问不重复续期');

  // 4. 过期:expiresAt 设为过去 → sessionValid 失效;touchSession 换发新会话
  store.gateData.applicants[ID].sess.expiresAt = Date.now() - 1000;
  ok(store.sessionValid(store.gateData.applicants[ID]) === false,
    '过期会话判定无效');
  store.touchSession(store.gateData.applicants[ID]);
  const s2 = store.gateData.applicants[ID].sess;
  ok(!s2.revoked && s2.expiresAt > Date.now() && s2.issuedAt !== s1.issuedAt,
    '过期后 touchSession 换发新会话(重新识别路径)');

  // 5. 吊销:revokeSession 置 revoked + expiresAt=0 并持久化;sessionValid 失效
  ok(store.revokeSession(ID) === true, 'revokeSession 返回成功');
  ok(store.gateData.applicants[ID].sess.revoked === true
     && store.sessionValid(store.gateData.applicants[ID]) === false,
    '吊销后 sessionValid 判定无效');
  await store.saveGateData();
  const disk2 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  ok(disk2.applicants[ID].sess.revoked === true, '吊销状态已持久化');

  // 6. 吊销后设备重新识别(touchSession)→ 换发未吊销的新会话
  store.touchSession(store.gateData.applicants[ID]);
  const s3 = store.gateData.applicants[ID].sess;
  ok(!s3.revoked && s3.expiresAt > Date.now(),
    '吊销后设备重新识别自动换发新会话');

  // 7. 吊销不存在的档案返回 false
  ok(store.revokeSession('no-such-id') === false, '吊销不存在的档案安全失败');

  // 8. ownerAid 集成:vid 有效 → 认 vid;vid 会话吊销 → 退回 dk 兜底(同档案)
  store.gateData.applicants['other1'] = {
    answer: '其他', ua: 'OtherUA', dk: 'dk-other1', status: 'approved', applyTime: Date.now(),
  };
  const reqValid = { headers: { 'user-agent': 'TestUA' }, cookies: '' };
  // 直接通过 store 内部 API 模拟:ownerAid 读取 req 的 cookie,util.getCookies 解析 header.cookie
  const reqWithVid = { headers: { 'user-agent': 'TestUA', cookie: 'vid=sess01' } };
  store.gateData.applicants[ID].sess = { issuedAt: Date.now(), lastSeen: Date.now(), expiresAt: Date.now() + 86400000, revoked: false };
  ok(store.ownerAid(reqWithVid) === ID, 'vid 会话有效时归属认 vid');
  store.revokeSession(ID);
  ok(store.ownerAid(reqWithVid) === ID,
    'vid 吊销后经 dk/UA 兜底仍归并到同一档案(设备不被挡,Token 已失效)');
  const reqStranger = { headers: { 'user-agent': 'StrangerUA', cookie: 'vid=sess01' } };
  ok(store.ownerAid(reqStranger) === null,
    '陌生设备拿吊销 vid 无法冒认任何档案');

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
