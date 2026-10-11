// 上传归属安全回归: node scripts/test/test-upload-security.js
// 钉死 DG-SEC-001/002 在"本人上传清单"这条路径上的语义:
//   ① /api/myuploads 的归属判定与媒体门禁共用 siteconfig.isMineUpload 单一口径(只认本人有效 vid);
//   ② 旧的 `rec.dk !== dk && rec.aid !== aid` 是 OR 语义——同 UA(同型号设备/抄 UA)的陌生访客
//      能把别人上传的文件名列进自己的清单(文件名泄漏),现在必须拿不到;
//   ③ 2026-09-18 之前的存量无 aid 记录仍可按 dk 被本人认领,但认领当场绑死 aid,后来者拿不到;
//   ④ 会话被吊销的 vid 不再主张任何记录(与 canServeMedia 同真同假,不留第二道口子)。
// 不触碰真实 gate_data.json —— 通过 GATE_DATA_FILE 指向系统临时目录下的文件。
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-sec-'));
const tmpFile = path.join(tmpDir, 'gate_data.json');
process.env.GATE_DATA_FILE = tmpFile; // 必须在 require store 之前

const { gateData, deviceKey, issueSession, revokeSession, sessionValid } = require('../../lib/store.js');
const { isMineUpload, canServeMedia } = require('../../lib/siteconfig.js');
const { handleMyUploads } = require('../../lib/files-upload.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

// 两个访客用逐字相同的 UA(同型号手机),只有各自的 vid 能区分身份
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) UploadSecurityCheck/1.0';
const DK = deviceKey({ headers: { 'user-agent': UA } });

function reqOf(vid, url) {
  return {
    headers: { 'user-agent': UA, ...(vid ? { cookie: 'vid=' + vid } : {}) },
    url: url || '',
    socket: { remoteAddress: '203.0.113.7' },
  };
}
function resMock() {
  const res = {
    code: 0, body: null, headers: {},
    setHeader(k, v) { res.headers[k] = v; },
    getHeader(k) { return res.headers[k]; },
    writeHead(c, h) { res.code = c; if (h) Object.assign(res.headers, h); },
    end(b) { res.body = b ? JSON.parse(b) : null; },
  };
  return res;
}
function mkVisitor(id) {
  const a = {
    answer: '访客', ua: UA, dk: DK, status: 'approved',
    applyTime: Date.now(), lastAccess: Date.now(), visits: 0, note: '',
    localId: '', fpSet: {}, ips: [],
  };
  gateData.applicants[id] = a;
  issueSession(a); // 有效会话 → 该 vid 可用于授权
  return id;
}
// GET /api/myuploads 的返回名清单
function myUploads(vid) {
  const res = resMock();
  handleMyUploads(reqOf(vid), res, {});
  return res.code === 200 && res.body ? res.body.names : null;
}

console.log('[上传归属:本人清单与媒体门禁同一口径]');

gateData.applicants = {};
mkVisitor('vidA');
mkVisitor('vidB');
gateData.uploads = {
  'a.png': { dk: DK, aid: 'vidA', ts: Date.now(), mt: 'a'.repeat(20) },
  'b.png': { dk: DK, aid: 'vidB', ts: Date.now(), mt: 'b'.repeat(20) },
  'note.txt': { dk: DK, aid: 'vidA', ts: Date.now() }, // 非媒体扩展名,不该出现在清单
};

// 1. 本人带有效 vid:只见自己的媒体
const listA = myUploads('vidA');
ok(Array.isArray(listA) && listA.includes('a.png'), '本人(有效 vid)列出自己的上传');
ok(listA && !listA.includes('b.png'), '本人清单里没有同 UA 陌生人的文件(旧 OR 语义在此泄漏)');
ok(listA && !listA.includes('note.txt'), '清单只收媒体扩展名(txt 不上清单)');

// 2. 纯 UA、无 vid:什么都拿不到
const listAnon = myUploads(null);
ok(Array.isArray(listAnon) && listAnon.length === 0, '同 UA 但无有效 vid 的陌生访客:清单为空');
ok(Array.isArray(myUploads('no-such-vid')) && myUploads('no-such-vid').length === 0,
  '伪造/不存在的 vid:清单为空');

// 3. B 只看得见 B 的
const listB = myUploads('vidB');
ok(listB && listB.includes('b.png') && !listB.includes('a.png'), '另一个本人各自只看自己的(vid 而非 UA)');

// 4. 存量无 aid 记录(2026-09-18 之前的数据):无 vid 拿不到也不绑定;
//    第一个带有效 vid 且 dk 相同的读取者按一次性认领绑死 aid,此后别人再也拿不到
const legacy = { dk: DK, ts: Date.now() };
gateData.uploads['legacy.jpg'] = legacy;
ok(isMineUpload(reqOf(null), legacy, DK) === false && legacy.aid === undefined,
  '存量无 aid 记录:无 vid 的请求既拿不到也不绑定');
ok(!myUploads(null).includes('legacy.jpg'), '无 vid 的清单里没有存量记录');
ok(isMineUpload(reqOf('vidA'), legacy, DK) === true && legacy.aid === 'vidA',
  '存量记录:本人带有效 vid 可见,并当场把 aid 绑成该 vid');
ok(myUploads('vidA').includes('legacy.jpg'), '认领后本人清单列出它');
ok(!myUploads('vidB').includes('legacy.jpg'), '绑定后同 UA 的下一个人再也拿不到');

// 5. 与媒体门禁口径一致(不留第二道口子)
for (const [vid, name, want] of [['vidA', 'a.png', true], ['vidB', 'a.png', false], [null, 'a.png', false], ['vidB', 'b.png', true]]) {
  const req = reqOf(vid, '/photos/' + name);
  const mine = isMineUpload(req, gateData.uploads[name], DK);
  ok(mine === want && canServeMedia(req, 'photos', name) === want,
    'isMineUpload / canServeMedia / myuploads 三者同真同假: ' + (vid || '无 vid') + ' → ' + name);
}

// 6. 吊销的 vid 不再主张任何记录
mkVisitor('vidC');
gateData.uploads['c.png'] = { dk: DK, aid: 'vidC', ts: Date.now(), mt: 'c'.repeat(20) };
ok(myUploads('vidC').includes('c.png'), '吊销前:本人可见自己的上传');
ok(revokeSession('vidC') === true, 'revokeSession 成功');
ok(sessionValid(gateData.applicants.vidC) === false, '吊销后 sessionValid 为假');
ok(myUploads('vidC').length === 0, '吊销后的 vid 主张不了任何记录(永久失效)');
ok(canServeMedia(reqOf('vidC', '/photos/c.png'), 'photos', 'c.png') === false,
  '同一吊销 vid 也取不到文件本体(清单与门禁一起收紧)');

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
process.exit(failed ? 1 : 0);
