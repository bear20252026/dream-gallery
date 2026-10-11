// 会话机制回归测试: node scripts/test/test-session.js
// 不触碰真实 gate_data.json —— 通过 GATE_DATA_FILE 指向系统临时目录下的文件。
// 语义基线(2026-10-10 DG-AUTH-002 之后):
//   · 会话只能由正常入口签发:issueSession(管理员批准)、resumeSession(访客完成重新验证 /
//     handleCollect 那条入口);touchSession 只对"已经有效"的会话续期,绝不再顺手换发。
//   · 吊销 = authVersion+1 且 sess 写成永不匹配的旧版本号 → 永久无效,任何自动路径都不复活。
//   · 兼容护栏(必须钉住,否则下次"严格化"会让全部老访客会话集体失效):
//     档案完全没有 sess 视为有效;历史 sess 没有 authVersion 一律按 0 解读。
//   · dk/UA 归并只允许命中"完全匿名且从未被认领"的档案;被吊销过的不再供归并。
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
const tmpFile = path.join(tmpDir, 'gate_data.json');
process.env.GATE_DATA_FILE = tmpFile; // 必须在 require store 之前设置

const store = require('../../lib/store.js');
const gate = require('../../lib/gate.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

const DAY = 24 * 60 * 60 * 1000;
function resMock() {
  const res = {
    code: 0, body: null, headers: {},
    setHeader(k, v) { res.headers[k] = v; },
    getHeader(k) { return res.headers[k]; },
    writeHead(c, h) { res.code = c; if (h) Object.assign(res.headers, h); },
    end(b) { try { res.body = b ? JSON.parse(b) : null; } catch (e) { res.body = null; } },
  };
  return res;
}
function cookieReq(ua, vid) {
  return { headers: { 'user-agent': ua, ...(vid ? { cookie: 'vid=' + vid } : {}) }, url: '', socket: { remoteAddress: '203.0.113.7' } };
}
// util.readBody 只挂 data/end 监听:让 on() 立刻回调,同步拿到 body
function bodyReq(body, ua, vid) {
  const req = cookieReq(ua, vid);
  req.on = function (ev, cb) {
    if (ev === 'data') cb(JSON.stringify(body));
    else if (ev === 'end') cb();
    return this;
  };
  req.destroy = () => {};
  return req;
}

(async () => {
  console.log('[vid 会话机制:吊销永久 + 兼容护栏]');

  // ---------- 1. 兼容护栏:档案完全没有 sess ----------
  const LEG = 'legacy01'; // 2026-09-01 之前建的老档案:没有 sess、没有 authVersion
  store.gateData.applicants[LEG] = {
    answer: '访客', ua: 'LegacyUA', dk: 'dk-legacy01', status: 'approved',
    applyTime: Date.now() - 200 * DAY, lastAccess: Date.now(),
  };
  ok(store.sessionValid(store.gateData.applicants[LEG]) === true,
    '护栏①:存量档案没有 sess 一律视为有效(迁移期不批量失效)');
  ok(store.sessionRevoked(store.gateData.applicants[LEG]) === false,
    '护栏①伴生:没有 sess 不算"被吊销"');
  ok(store.authVid(cookieReq('LegacyUA', LEG)) === LEG,
    '护栏①伴生:无 sess 的老档案 vid 可直接用于授权');
  ok(store.ownerAid(cookieReq('LegacyUA', LEG)) === LEG, '护栏①伴生:归属判定同样认它');

  // touchSession 对无 sess 档案是"补建",不是"复活"
  store.touchSession(store.gateData.applicants[LEG]);
  await store.saveGateData();
  const s0 = store.gateData.applicants[LEG].sess;
  ok(!!(s0 && s0.issuedAt > 0 && s0.expiresAt > Date.now() && s0.revoked === false),
    'touchSession 为无 sess 档案补建会话(30 天有效期)');
  const disk0 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  ok(!!(disk0.applicants[LEG] && disk0.applicants[LEG].sess), '补建的会话已持久化到磁盘');

  // ---------- 2. 兼容护栏:历史 sess 没有 authVersion ----------
  const HIS = 'history01';
  store.gateData.applicants[HIS] = {
    answer: '访客', ua: 'HistoryUA', dk: 'dk-history01', status: 'approved', applyTime: Date.now() - DAY, lastAccess: Date.now(),
    sess: { issuedAt: Date.now() - DAY, lastSeen: Date.now() - 2 * DAY, expiresAt: Date.now() + DAY, revoked: false },
  };
  ok(store.sessionValid(store.gateData.applicants[HIS]) === true,
    '护栏②:线上历史 sess 无 authVersion 字段 → 按 0 解读,仍判有效(部署不掉登录)');
  ok(store.sessionRevoked(store.gateData.applicants[HIS]) === false,
    '护栏②伴生:缺字段不等于被吊销');
  ok(store.authVid(cookieReq('HistoryUA', HIS)) === HIS,
    '护栏②伴生:这种历史 sess 的 vid 仍可主张本人的上传');
  const issuedHIS = store.gateData.applicants[HIS].sess.issuedAt;
  store.gateData.applicants[HIS].sess.lastSeen = Date.now() - 2 * DAY; // 越过 1 小时节流
  store.touchSession(store.gateData.applicants[HIS]);
  const sHIS = store.gateData.applicants[HIS].sess;
  ok(sHIS.expiresAt > Date.now() + 29 * DAY && sHIS.issuedAt === issuedHIS && sHIS.authVersion === undefined,
    '护栏②伴生:续期只推 expiresAt,不改 issuedAt,也不给历史 sess 塞 authVersion');

  // ---------- 3. 有效会话:滑动续期与节流 ----------
  const ID = 'sess01';
  store.gateData.applicants[ID] = {
    answer: '测试访客', ua: 'SessUA', dk: 'dk-sess01', status: 'approved',
    applyTime: Date.now(), lastAccess: Date.now(),
  };
  store.issueSession(store.gateData.applicants[ID]); // 会话只由正常入口签发
  ok(store.sessionValid(store.gateData.applicants[ID]) === true, 'issueSession 签发的会话有效');
  store.gateData.applicants[ID].sess.lastSeen = Date.now() - 2 * DAY;
  store.gateData.applicants[ID].sess.expiresAt = Date.now() + 60000;
  store.touchSession(store.gateData.applicants[ID]);
  const s1 = store.gateData.applicants[ID].sess;
  ok(s1.expiresAt > Date.now() + 29 * DAY, '有效会话滑动续期(expiresAt 推到 30 天后)');
  const ls = s1.lastSeen;
  store.touchSession(store.gateData.applicants[ID]);
  ok(store.gateData.applicants[ID].sess.lastSeen === ls, '1 小时节流内重复访问不重复续期');

  // ---------- 4. 过期:touchSession 不换发,只有重新验证才恢复 ----------
  store.gateData.applicants[ID].sess.expiresAt = Date.now() - 1000;
  ok(store.sessionValid(store.gateData.applicants[ID]) === false, '过期会话判定无效');
  ok(store.sessionRevoked(store.gateData.applicants[ID]) === false, '过期 ≠ 吊销(身份仍可续用)');
  const expiredSnap = JSON.stringify(store.gateData.applicants[ID].sess);
  store.touchSession(store.gateData.applicants[ID]);
  ok(JSON.stringify(store.gateData.applicants[ID].sess) === expiredSnap &&
    store.sessionValid(store.gateData.applicants[ID]) === false,
    '过期后 touchSession 不再自动换发(旧实现在此复活会话)');
  ok(store.authVid(cookieReq('SessUA', ID)) === null,
    '过期期间该 vid 不用于任何授权(entryGate 只带 cookie 续命,不换发)');
  const resumed = store.resumeSession(store.gateData.applicants[ID]);
  ok(resumed.expiresAt > Date.now() && resumed.authVersion === (store.gateData.applicants[ID].authVersion || 0) &&
    store.sessionValid(store.gateData.applicants[ID]) === true,
    'resumeSession(完成重新验证)才恢复:换发新会话,authVersion 不动');

  // 同 UA 归并只认"完全匿名且从未被认领"的档案;那条路走 autoAdmit→resumeSession,过期可换发、吊销永不
  const AM = 'anon01';
  store.gateData.applicants[AM] = {
    answer: '访客', ua: 'AnonMergeUA', dk: store.deviceKey({ headers: { 'user-agent': 'AnonMergeUA' } }),
    status: 'approved', applyTime: Date.now(), lastAccess: Date.now(), localId: '', fpSet: {},
  };
  store.issueSession(store.gateData.applicants[AM]);
  store.gateData.applicants[AM].sess.expiresAt = Date.now() - 1000;
  const anonIds = Object.keys(store.gateData.applicants).length;
  gate.autoAdmit(cookieReq('AnonMergeUA'), resMock(), '/api/x');
  ok(Object.keys(store.gateData.applicants).length === anonIds &&
    store.sessionValid(store.gateData.applicants[AM]) === true &&
    store.gateData.applicants[AM].answer === '访客',
    '过期未吊销的完全匿名档案:同 UA 归并回同一身份并经 resumeSession 换发(迁移兜底)');

  // handleCollect = 访客端"完成重新验证"的真实入口
  const COL = 'collect01';
  store.gateData.applicants[COL] = {
    answer: '访客', ua: 'CollectUA', dk: store.deviceKey({ headers: { 'user-agent': 'CollectUA' } }),
    status: 'approved', applyTime: Date.now(), lastAccess: Date.now(), localId: 'lid-collect', fpSet: {},
  };
  store.issueSession(store.gateData.applicants[COL]);
  store.gateData.applicants[COL].sess.expiresAt = Date.now() - 1000;
  ok(store.sessionValid(store.gateData.applicants[COL]) === false, '待重新验证的档案:会话已过期');
  const beforeIds = Object.keys(store.gateData.applicants).length;
  gate.handleCollect(bodyReq({ lid: 'lid-collect', fp: { scr: '390x844x3', canvas: 'cc1' } }, 'CollectUA', COL), resMock());
  ok(Object.keys(store.gateData.applicants).length === beforeIds,
    'handleCollect 认回同一身份,不另建档');
  ok(store.sessionValid(store.gateData.applicants[COL]) === true &&
    store.authVid(cookieReq('CollectUA', COL)) === COL,
    'handleCollect 完成重新验证 → 换发会话,vid 立刻可用于授权');

  // ---------- 5. 吊销:永久无效 ----------
  ok(store.revokeSession(ID) === true, 'revokeSession 返回成功');
  const a5 = store.gateData.applicants[ID];
  ok(a5.authVersion === 1 && a5.sess.revoked === true && a5.sess.authVersion === -1 &&
    typeof a5.sess.revokedAt === 'number',
    '吊销 = authVersion+1 且 sess 写成永不匹配的旧版本号');
  ok(store.sessionValid(a5) === false && store.sessionRevoked(a5) === true, '吊销后 sessionValid 永久为假');
  await store.saveGateData();
  const disk1 = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  ok(disk1.applicants[ID].sess.revoked === true && disk1.applicants[ID].sess.authVersion === -1 &&
    store.sessionValid(disk1.applicants[ID]) === false,
    '吊销状态已持久化,重启后仍判无效');

  const revokedSnap = JSON.stringify(a5.sess);
  for (let i = 0; i < 3; i++) store.touchSession(a5);
  ok(JSON.stringify(a5.sess) === revokedSnap && store.sessionValid(a5) === false,
    '吊销后 touchSession 反复调用也不复活');
  ok(JSON.stringify(store.resumeSession(a5)) === revokedSnap && store.sessionValid(a5) === false,
    '吊销后 resumeSession(重新验证)也不复活 —— 与过期的唯一分岔');
  ok(store.revokeSession('no-such-id') === false && store.revokeSession('__proto__') === false,
    '吊销不存在/原型键档案安全失败');

  // ---------- 6. 吊销后的 dk/UA 归并:只允许"完全匿名且从未被认领且未被吊销"的档案 ----------
  const RK = 'revoked01'; // 除了被吊销过,别的认领信号一个都没有(匿名档案)
  store.gateData.applicants[RK] = {
    answer: '访客', ua: 'RevokeMergeUA', dk: store.deviceKey({ headers: { 'user-agent': 'RevokeMergeUA' } }),
    status: 'approved', applyTime: Date.now(), lastAccess: Date.now(), localId: '', fpSet: {},
  };
  store.issueSession(store.gateData.applicants[RK]);
  ok(store.isUnclaimedProfile(store.gateData.applicants[RK]) === true,
    '未吊销的匿名档案按设计可被同 UA 续用(存量迁移兜底)');
  store.revokeSession(RK);
  ok(store.isUnclaimedProfile(store.gateData.applicants[RK]) === false,
    '吊销后的匿名档案不再"可供归并"(毒化身份不再传给同 UA 的人)');
  const idsBefore = Object.keys(store.gateData.applicants).length;
  gate.autoAdmit(cookieReq('RevokeMergeUA'), resMock(), '/api/x');
  ok(Object.keys(store.gateData.applicants).length === idsBefore + 1,
    '同 UA 陌生人在此只会被另建新身份,不会被并入被吊销的档案');
  ok(store.sessionValid(store.gateData.applicants[RK]) === false,
    '被吊销的档案不会因为别人来访被洗白');

  // ---------- 7. 归属判定认 vid(会话有效时),吊销即断 ----------
  const OWNUA = 'OwnerOnlyUA';
  const OW = 'owner01';
  store.gateData.applicants[OW] = {
    answer: '访客', ua: OWNUA, dk: store.deviceKey({ headers: { 'user-agent': OWNUA } }),
    status: 'approved', applyTime: Date.now(), lastAccess: Date.now(), localId: '', fpSet: {},
  };
  store.issueSession(store.gateData.applicants[OW]);
  const reqOwner = cookieReq(OWNUA, OW);
  ok(store.authVid(reqOwner) === OW && store.ownerAid(reqOwner) === OW,
    'vid 会话有效时:归属认该 vid(issueSession 建立的会话,与线上同构)');
  store.revokeSession(OW);
  ok(store.authVid(reqOwner) === null, '吊销后 authVid 不再认这个 vid');
  ok(store.ownerAid(reqOwner) === null,
    '吊销后 ownerAid 也不再经 dk/UA 归并回同一档案(旧断言的相反面:被吊销的身份不再供续用)');
  ok(store.ownerAid(cookieReq('StrangerUA', OW)) === null, '陌生设备拿吊销 vid 无法冒认任何档案');
  ok(store.sessionValid(store.gateData.applicants[OW]) === false,
    '吊销会话不经任何自动路径恢复:只有管理员批准走 issueSession');
  store.issueSession(store.gateData.applicants[OW]);
  ok(store.sessionValid(store.gateData.applicants[OW]) === true && store.authVid(reqOwner) === OW,
    'issueSession(管理员批准走的入口)是恢复会话的唯一路径');

  // ---------- 8. entryGate 必须让「只是过期」的本人会话自愈 ----------
  // 回归钉子:2026-10-11 发现前端指纹补采通道(src/visitor-fp.js → POST /api/entry/collect)早已是死代码,
  // 而 entryGate 只 touchSession(过期不动) ⇒ 30 天空闲过期的回访者身份认得回、authVid 却是 null,
  // 本人照片与 mt 下发集体 403,只能靠管理员人工批准。修法=entryGate 走 resumeSession。
  const EXUA = 'ExpiredSelfHealUA';
  const EX = 'expired01';
  store.gateData.applicants[EX] = {
    answer: '访客', ua: EXUA, dk: store.deviceKey({ headers: { 'user-agent': EXUA } }),
    status: 'approved', applyTime: Date.now(), lastAccess: Date.now(), localId: 'lid-ex', fpSet: {},
  };
  store.issueSession(store.gateData.applicants[EX]);
  store.gateData.applicants[EX].sess.expiresAt = Date.now() - 1000; // 过期,但版本号仍匹配(未吊销)
  const reqExpired = cookieReq(EXUA, EX);
  ok(store.sessionValid(store.gateData.applicants[EX]) === false && store.sessionRevoked(store.gateData.applicants[EX]) === false,
    '前置:会话只是过期,不是被吊销');
  ok(store.authVid(reqExpired) === null, '前置:过期会话下 authVid 不认(这正是 403 的根因)');
  ok(gate.entryGate(reqExpired, resMock(), '/') === true, '过期本人仍被放行进画廊(自由进画廊规矩不变)');
  ok(store.sessionValid(store.gateData.applicants[EX]) === true && store.authVid(reqExpired) === EX,
    '本人 vid Cookie 走过期自愈:authVid 恢复 ⇒ 自有照片与 mt 重新可见');

  // 吊销过的绝不自愈:同一条 Cookie 再走 entryGate 也不得复活
  store.revokeSession(EX);
  ok(store.authVid(reqExpired) === null, '吊销后 authVid 立即失效');
  gate.entryGate(reqExpired, resMock(), '/');
  ok(store.sessionValid(store.gateData.applicants[EX]) === false && store.sessionRevoked(store.gateData.applicants[EX]) === true,
    'entryGate 不复活被吊销会话(DG-AUTH-002 与自愈必须同时成立)');
  store.issueSession(store.gateData.applicants[EX]);
  ok(store.sessionValid(store.gateData.applicants[EX]) === true,
    '被吊销的身份只能由管理员批准(issueSession)恢复');

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
