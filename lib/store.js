// ===================== 审批门数据(JSON 持久化) =====================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, GATE_MODE, ONCE_GRACE_MS, DAY_MS } = require('./config');
const { getCookies } = require('./util');

// GATE_DATA_FILE 可重定向(测试用,避免触碰真实数据);默认 ROOT/gate_data.json
const DATA_FILE = process.env.GATE_DATA_FILE || path.join(ROOT, 'gate_data.json');
const DATA_FILE_TMP = DATA_FILE + '.tmp';   // JSON 镜像的原子写:先写临时文件,再 rename 覆盖

// SQLite 主持久层(2026-09-01 审计改进项#1):
//  - 整个 gateData 快照以 WAL 事务写入 gate_data.db,原子且崩溃安全,取代纯 JSON 的 .tmp+rename
//  - USE_SQLITE=0 一键回退纯 JSON(回滚开关);better-sqlite3 缺失时自动降级
//  - DB 路径默认由 DATA_FILE 派生(测试临时目录自动隔离);_savedAt 双写标记,
//    加载时取 DB/JSON 中较新的一方——SQLite 写失败重启后不会复活旧快照
const sqlite = require('./sqlite-store');
const SQLITE_ENABLED = process.env.USE_SQLITE !== '0';
const DB_FILE = process.env.SQLITE_PATH || DATA_FILE.replace(/\.json$/i, '.db');
if (SQLITE_ENABLED) { sqlite.initDb(DB_FILE); sqlite.startCheckpoint(); process.on('exit', () => sqlite.close()); }
// 热集合持久层(B5 拆双轨后):真表是唯一权威,shadow.visit 返回真实持久判定,
// 成功即免整库落盘,失败回旁路(数组+saveGateData)。
// 依赖方向是 store → shadow → repo → sqlite-store(**shadow 绝不反向 require 本模块**,
// 否则 store→shadow→store 成环),所以 shadow 需要 gateData 时由调用方把数组当参数传进去
// (见 server.js listen 里的 shadow.start(gateData))。
// USE_SQLITE=0 / better-sqlite3 缺失 ⇒ shadow.on() 恒假 ⇒ 写读都回 json/kv 旁路。
const shadow = require('./shadow');
// 读门面(B5 后精简):访问明细等读走真表,不可用/抛错返 null 回旁路数组。
// 依赖方向 store → hotread → shadow → repo(叶子),无环。
const hotread = require('./hotread');

let gateData = null;
function loadGateData() {
  let fromDb = null, fromJson = null;
  if (SQLITE_ENABLED) fromDb = sqlite.loadAll();
  try {
    fromJson = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { /* 无 JSON 或损坏,视为空 */ }
  const dbTs = (fromDb && typeof fromDb === 'object' && fromDb._savedAt) || 0;
  const jsonTs = (fromJson && typeof fromJson === 'object' && fromJson._savedAt) || 0;
  gateData = dbTs >= jsonTs && fromDb ? fromDb : fromJson;
  if (!gateData || typeof gateData !== 'object') {
    gateData = { secret: crypto.randomBytes(24).toString('hex'), applicants: {}, stats: { total: 0, byDay: {} } };
  }
  if (!gateData.secret) gateData.secret = crypto.randomBytes(24).toString('hex');
  if (!gateData.applicants) gateData.applicants = {};
  if (!gateData.stats) gateData.stats = { total: 0, byDay: {} };
  if (!gateData.stats.byDay) gateData.stats.byDay = {};
  if (!gateData.blockedIps) gateData.blockedIps = []; // 拉黑 IP(禁止申请和访问)
  if (!gateData.watchIps) gateData.watchIps = [];     // 重点关注 IP(申请时特殊标识)
  saveGateData();
}
// 保存(2026-09-01 改 SQLite 主持久层;2026-10-14 第六轮审计 M-11 改成**有结果契约**):
//  - 一次保存 = SQLite(WAL 事务,影子写)→ JSON 镜像(原子 rename),两条各记各的结论;
//    任何一边失败都不许另一边冒充它成功。
//  - **返回值就是结论对象**。以前是 `_writeChain.then(...).catch(e => console.error)`,链尾那个 catch
//    把错误全吞了 ⇒ 调用方 `await` 到的永远是"成功"。形状:
//      { ok, savedAt, sqliteOk, sqliteReason, jsonOk, errors[], ms, queuedMs }
//        ok           = sqliteOk 且 jsonOk
//        jsonOk       = 镜像落盘成功 —— **当前 loadGateData 唯一真读它的持久介质**,
//                       上传/删除这类"要给用户一个诚实的 200/503"就判它
//        sqliteReason = 'ok' | 'disabled'(USE_SQLITE=0)| 'unavailable'(原生模块没装成,设计内回退)
//                       | 'error' —— 前两种**不算失败**,免得每次保存都红
//        ms / queuedMs = 纯写耗时 / 排队等待(并发时这俩必须分开,否则量到的是队列不是磁盘)
//  - _savedAt 挪到**任务体内**取(以前在入队时取):排队严重时镜像里记的会比真正写盘更早,
//    而加载仲裁按 _savedAt 取较新一方 ⇒ 极端情况下新写可能被当成旧的。
//  - 失败**折成结论**而不是抛(见 saveGateData 上方那段:数十处即发即忘的调用方一旦收到 reject,
//    Node ≥15 会因未处理 rejection 直接把进程干掉)。要判成败就 await 之后看 `.ok` / `.jsonOk`。
//  - 多 worker / 多实例:读侧仍是各自内存副本,真正多实例需逐行化改造(后续批次)
let _writeChain = Promise.resolve();
let _lastSaveResult = null;
// 2026-11-17 C10 队列内合并(coalescing):gateData 是单一可变对象,任何排队任务写的都是
// **同一份最新内存快照** ⇒ 突发 N 次 save 只需"在飞 1 次 + 至多 1 个待写"。已有 pending 时
// 新调用复用其 promise(各自 onWrite 仍逐个触发)。零时间窗:不引入定时器/debounce,
// await 语义仍是"真实写盘后才 resolve",崩溃安全与合并前完全一致(SIGKILL 不新增丢失窗)。
let _pendingSave = null; // { promise, writers: [{t0,onWrite}] }

function _saveSqlite() {
  if (!SQLITE_ENABLED) return { ok: true, reason: 'disabled' };
  // better-sqlite3 缺失 / 没开成库 ⇒ 不算失败:这是设计内的回退档,JSON 镜像就是唯一持久层。
  // 把"降级"记成错误会让每次保存都红。
  if (!sqlite.available()) return { ok: true, reason: 'unavailable' };
  try {
    // syncAll 自己 catch:成功 true、写坏 false(错误已在 [sqlite] 日志里),不抛
    return sqlite.syncAll(gateData)
      ? { ok: true, reason: 'ok' }
      : { ok: false, reason: 'error', error: 'sqlite.syncAll 返回 false(详见 [sqlite] 写入失败 日志)' };
  } catch (e) {
    return { ok: false, reason: 'error', error: (e && e.message) || String(e) };
  }
}

// 一次真实写盘。t0 是"调用发生"的时刻(异步路径在入队前取),所以结果里同时给出
// **纯写耗时** ms 与**排队等待** queuedMs —— 写盘延迟探针要的是前者,以前只量得到后者。
function _runSaveTask(t0, onWrite, writers) {
  const w0 = Date.now();
  const r = {
    ok: false,
    savedAt: w0,
    sqliteOk: false,
    sqliteReason: '',
    jsonOk: false,
    errors: [],
    ms: 0,
    queuedMs: w0 - t0,
  };
  gateData._savedAt = r.savedAt;
  const sq = _saveSqlite();
  r.sqliteOk = sq.ok;
  r.sqliteReason = sq.reason;
  if (!sq.ok) r.errors.push('SQLite 影子写失败: ' + sq.error);
  try {
    fs.writeFileSync(DATA_FILE_TMP, JSON.stringify(gateData));
    fs.renameSync(DATA_FILE_TMP, DATA_FILE);
    r.jsonOk = true;
  } catch (e) {
    r.jsonOk = false;
    r.errors.push('JSON 镜像落盘失败: ' + ((e && e.message) || e));
  }
  r.ok = r.jsonOk && r.sqliteOk;
  r.ms = Date.now() - w0;
  _lastSaveResult = r;
  if (!r.ok) console.error('[store] 保存未完全落盘:', r.errors.join(' | '));
  // onWrite 逐个触发:合并写时每个等待方都拿到同一份真实结论,但 queuedMs 按各自入队时刻算
  // (否则后入队者的"排队等待"会被算成先入队者的,写盘延迟探针失真)。
  const notify = (w) => {
    if (typeof w.onWrite !== 'function') return;
    try {
      w.onWrite({
        ms: r.ms,
        queuedMs: w0 - w.t0,
        savedAt: r.savedAt,
        sqliteOk: r.sqliteOk,
        jsonOk: r.jsonOk,
      });
    } catch (e) {
      console.warn('[store] onWrite 回调抛错:', (e && e.message) || e);
    }
  };
  if (writers && writers.length) writers.forEach(notify);
  else notify({ t0, onWrite });
  return r;
}

// ⚠️这条链**永不 reject**:失败一律折成 `{ ok:false, errors:[…] }` 的**已解决**结果。
//   原因不是洁癖 —— 全站数十处 `saveGateData()` 是不 await 的即发即忘(记一笔数、续个会话、
//   绑定一次归属…),Node ≥15 对未处理的 rejection 默认**直接终结进程**,所以只要磁盘出问题
//   (ENOSPC / EACCES),一个"诚实的 reject"就会把整个画廊干掉。诚实体现在**结论可读**,
//   不是体现在"把异常抛给不接的人"。
function saveGateData() {
  const t0 = Date.now();
  const onWrite = typeof arguments[0] === 'function' ? arguments[0] : null;
  // C10 队列内合并:已有待写任务 ⇒ 本次变更必然被它覆盖(同一份 gateData 最新快照),
  // 挂进它的等待方列表复用 promise,不再排一个新任务。突发 N 次 ⇒ ≤2 次真实写盘。
  if (_pendingSave) {
    _pendingSave.writers.push({ t0, onWrite });
    return _pendingSave.promise;
  }
  const writers = [{ t0, onWrite }];
  const promise = _writeChain
    .then(() => {
      // 开写即释放槽位:写盘期间的新调用排下一轮(写的快照已定格)。
      // 只释放"仍是自己"的槽位:onWrite 回调可能同步再调 saveGateData 建了新 pending,别误清。
      if (_pendingSave && _pendingSave.promise === promise) _pendingSave = null;
      return _runSaveTask(t0, null, writers);
    })
    .catch((e) => {
      // 到这儿只剩"任务自己炸了"(两条写盘各自都 catch 过)。转成结论,不 reject(见上面那段)。
      if (_pendingSave && _pendingSave.promise === promise) _pendingSave = null;
      const msg = (e && e.message) || String(e);
      console.error('[store] 保存异常(已折成失败结论):', msg);
      const r = {
        ok: false,
        savedAt: Date.now(),
        sqliteOk: false,
        sqliteReason: 'error',
        jsonOk: false,
        errors: ['保存任务异常: ' + msg],
        ms: 0,
        queuedMs: Date.now() - t0,
      };
      _lastSaveResult = r;
      return r;
    });
  _pendingSave = { promise, writers };
  _writeChain = promise;
  return promise;
}

// 同步落盘:给"现在就要一个可判定的结论"的收尾路径(优雅关闭、测试注入),同步返回同一个结果对象。
// ⚠️ 它绕开写队列:单线程下这次写本身是完整的,但若前面还排着异步任务,那个任务随后仍会再写一遍
//    当时的内存快照(后写覆盖前写,内容仍是最新的 gateData)。真要"排干队列"请先 await 那条链。
function saveGateDataSync() {
  return _runSaveTask(Date.now(), null);
}
function lastSaveResult() {
  return _lastSaveResult;
}
loadGateData(); // 审批门与答题系统共用此存储(quizPassed/quizAttempts),启动即加载

// 2026-11-17 C9:UA 品牌解析 / 真实 IP 与代理头信任(CF 网段)/ 设备指纹键 / 自动化识别
// 已迁出到 lib/request-identity.js(纯请求判定叶子,零 gateData/磁盘依赖)。
// 这里 re-export 保持全部消费方 `require('./store').realIP` 等引用形状不变。
const {
  parseBrand, trustedProxy, realIP, deviceKey, legacyDeviceKey, isAutomated,
} = require('./request-identity');

// 配额/限流身份键(2026-08-31 审计 H8):dk=sha1(UA) 可轮换伪造,
// 优先用不可猜的 vid Cookie(HttpOnly),无档案时才退回 dk(维持老访客兼容)
// 2026-09-01 会话化:vid 档案存在但会话已过期/吊销 → 视同无效,退回 dk 兜底
function quotaKey(req) {
  const vid = getCookies(req).vid;
  const a = vid ? getApplicant(vid) : null;
  if (a && sessionValid(a)) return vid.slice(0, 24);
  return deviceKey(req);
}

// 键数上限(2026-08-31 审计 H5):限流/配额表防伪造身份无限增键
// 值为时间戳的表删最旧;其余(日配额表,过期即无效)超限随机淘汰
function capKeys(obj, max) {
  const keys = Object.keys(obj);
  if (keys.length <= max) return;
  if (typeof obj[keys[0]] === 'number') {
    keys.sort((a, b) => obj[a] - obj[b]);
    for (const k of keys.slice(0, keys.length - max)) delete obj[k];
  } else {
    for (const k of keys.slice(0, keys.length - max)) delete obj[k];
  }
}

// 访客档案总量上限(H5):超限时按最近访问淘汰,防伪造 UA 无限建档膨胀
// (时间维度的最小化清理见 lib/retention.js:长期无访问的老档案先标记 expired,默认不删;
//  本函数的条数上限与 LRU 语义保持不变,两边共存)
function capApplicants(max) {
  max = max || 5000;
  const list = Object.entries(gateData.applicants);
  if (list.length <= max) return;
  list.sort((a, b) => (a[1].lastAccess || 0) - (b[1].lastAccess || 0));
  for (const [id] of list.slice(0, list.length - max)) delete gateData.applicants[id];
}

// (deviceKey/legacyDeviceKey 已迁 lib/request-identity.js,C9;顶部 re-export 引入)
function findByDevice(req) {
  const dk = deviceKey(req);
  const ua = req.headers['user-agent'] || '';
  let best = null, bestId = null;
  for (const [id, a] of Object.entries(gateData.applicants)) {
    if (a.dk === dk || (ua && a.ua === ua)) {
      if (!best || a.applyTime > best.applyTime) { best = a; bestId = id; }
    }
  }
  return best ? { id: bestId, a: best } : null;
}

// 访客身份(2026-07-28 OWASP 审计:A01 上传归属原来只认 sha1(UA)——同型号设备撞车、改 UA 即伪造)。
// vid Cookie 是随机 16 位不可猜测值,只存在本人浏览器:归属匹配优先 vid。
// 2026-10-10 DG-SEC-002:dk 兜底只许落到「完全匿名且从未被认领」的档案——
// 同 UA 的陌生访客不得因此冒领他人身份(旧实现会把 A 的档案直接判给 B)。
function ownerAid(req) {
  const vid = authVid(req);
  if (vid) return vid;
  const f = findByDevice(req);
  return f && isUnclaimedProfile(f.a) ? f.id : null;
}

// 可作授权用的当前 vid:必须本人 Cookie 且会话有效(不经 UA/dk 任何兜底)。
// 私有媒体可见性与 mt 下发一律以此为准(DG-SEC-001/002)。
function authVid(req) {
  const vid = getCookies(req).vid;
  const a = vid ? getApplicant(vid) : null;
  return a && sessionValid(a) ? vid : null;
}

// 完全匿名、从未被真人认领的档案(没有昵称/持久设备 ID/多维指纹,也没被踢过)。
// 只有这类档案才允许被同一 UA 的设备按 dk 归并——作为 2026-09-18 之前存量数据的迁移兜底;
// 一旦浏览器提交过指纹或改过昵称,该档案就归本人专属,别人 UA 撞车也并不进来。
function isUnclaimedProfile(a) {
  if (!a) return false;
  if (a.kickedTime || a.status === 'kicked' || a.status === 'reapply' ||
      a.status === 'denied' || a.status === 'history') return false;
  if (a.localId) return false;
  if (a.fpSet && Object.keys(a.fpSet).length) return false;
  if (a.answer && a.answer !== '访客') return false;
  // 被吊销过的身份不再供 dk 续用:否则陌生人与其一起被"毒化"——
  // 会话永久无效 → 新上传的 aid 指向死身份 → 谁也无法主张(且没有恢复入口)
  if (sessionRevoked(a)) return false;
  return true;
}

// ===================== 会话机制(2026-09-01 建立;2026-10-10 DG-AUTH-002 改 authVersion 永久吊销) =====================
// 档案带 authVersion(缺省视为 0,不需要迁移脚本,读时 `a.authVersion || 0`):
//  - 吊销 = authVersion + 1,并把 sess 写成永不匹配的旧版本号 → 会话失效是永久状态
//  - 旧实现「session 失效即由 touchSession 自动换发」正是复活路径,已彻底堵死
//  - 重新取得会话只剩正常入口:管理员批准(lib/admin approve)、访客完成重新验证(handleCollect/autoAdmit)
//  - 30 天空闲过期(滑动续期只对已有效的会话);老档案无 sess 视为有效(迁移期兼容,不批量失效)
const SESSION_IDLE_MS = 30 * DAY_MS;
const SESSION_TOUCH_THROTTLE_MS = 3600000; // 续期落盘节流:1 小时内重复访问不重复写盘

function ensureSession(a) {
  const now = Date.now();
  if (!a.sess || typeof a.sess !== 'object' || !a.sess.issuedAt) {
    a.sess = { issuedAt: now, lastSeen: now, expiresAt: now + SESSION_IDLE_MS, authVersion: a.authVersion || 0, revoked: false };
  }
  return a.sess;
}

// 签发全新会话(唯一能创建/覆盖 a.sess 的入口)——版本号取当前值,立即匹配
function issueSession(a) {
  if (!a || typeof a !== 'object') return null;
  const now = Date.now();
  a.sess = { issuedAt: now, lastSeen: now, expiresAt: now + SESSION_IDLE_MS, authVersion: a.authVersion || 0, revoked: false };
  saveGateData();
  return a.sess;
}

function sessionValid(a) {
  if (!a) return false;
  const s = a.sess;
  if (!s || typeof s !== 'object') return true; // 存量档案从未建会话:迁移期兼容
  if (sessAuthVersion(s) !== (a.authVersion || 0)) return false; // 版本不符(含吊销写入的 -1)一律无效
  return Date.now() <= s.expiresAt;
}

// 存量数据兼容:线上历史 sess 没有 authVersion 字段,一律按 0 解读(等价于「从未被吊销过」),
// 否则一次部署就让所有访客的会话集体失效(自有照片全员看不见)
function sessAuthVersion(s) {
  return typeof s.authVersion === 'number' ? s.authVersion : 0;
}

// 该档案的会话是否「被吊销过」(版本号不匹配)。
// 用于区分两种失效:过期只是暂时失效,本人 Cookie 还在 → 身份可续用,经重新验证换发新会话;
// 吊销是永久状态 → 身份也不再供归并,恢复只能靠管理员批准(DG-AUTH-002)
function sessionRevoked(a) {
  if (!a) return false;
  const s = a.sess;
  if (!s || typeof s !== 'object') return false;
  return sessAuthVersion(s) !== (a.authVersion || 0);
}

// 有效访问时调用:只在会话已有效时续期 expiresAt;绝不重新签发、绝不复位 revoked
function touchSession(a) {
  if (!a || typeof a !== 'object') return;
  if (!a.sess || typeof a.sess !== 'object') { ensureSession(a); saveGateData(); return; } // 存量补建,不是复活
  if (!sessionValid(a)) return; // 过期/吊销:原样不动
  const now = Date.now();
  if (now - (a.sess.lastSeen || 0) < SESSION_TOUCH_THROTTLE_MS) return;
  a.sess.lastSeen = now;
  a.sess.expiresAt = now + SESSION_IDLE_MS;
  saveGateData();
}

// 正常入口(新建档案 / 完成重新验证)与会话收口:
// 有效→续期;从未建过或只是过期→换发;吊销过(版本不符)→保持无效,永不借此复活
function resumeSession(a) {
  if (!a || typeof a !== 'object') return null;
  if (!a.sess || typeof a.sess !== 'object') return issueSession(a);
  if (sessAuthVersion(a.sess) !== (a.authVersion || 0)) return a.sess;
  if (sessionValid(a)) { touchSession(a); return a.sess; }
  return issueSession(a);
}

// 管理员吊销:永久失效。revoked 布尔只作可读标记,判定依据是版本号永不匹配
function revokeSession(vid) {
  const a = getApplicant(vid);
  if (!a) return false;
  a.authVersion = (a.authVersion || 0) + 1;
  a.sess = { revokedAt: Date.now(), authVersion: -1, revoked: true };
  saveGateData();
  return true;
}

// mt 媒体令牌轮换(DG-AUTH-003):重签令牌并盖签发时间,旧 URL 自然失效
// noSave=true 供批量轮换收口成一次落盘(调用方自己 saveGateData)
function rotateMt(name, noSave) {
  const u = gateData.uploads && gateData.uploads[name];
  if (!u) return null;
  u.mt = crypto.randomBytes(10).toString('hex');
  u.mtIssuedAt = Date.now();
  if (!noSave) saveGateData();
  return u.mt;
}

// 安全读取访客档案(2026-08-31 审计 H3):普通对象上 applicants["__proto__"] 会返回 Object.prototype,
// 攻击者可借此伪造合法身份并污染原型。所有按键读取一律走本函数
function getApplicant(key) {
  if (!key || typeof key !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(gateData.applicants, key) ? gateData.applicants[key] : null;
}

function signId(id) {
  return crypto.createHmac('sha256', gateData.secret).update(id).digest('hex').slice(0, 24);
}
function todayStr() {
  // 使用服务器本地时间(UTC+8),而非 UTC;toISOString() 会偏移 8 小时导致跨天统计不准
  var d=new Date();
  var yyyy=d.getFullYear();
  var mm=String(d.getMonth()+1).padStart(2,'0');
  var dd=String(d.getDate()).padStart(2,'0');
  return yyyy+'-'+mm+'-'+dd;
}

// 批准是否已过期(day 超 24h / once 超宽限)
function levelExpired(a) {
  const now = Date.now();
  if (a.level === 'day' && now > a.approveTime + DAY_MS) return true;
  if (a.level === 'once' && a.firstAccess && now > a.firstAccess + ONCE_GRACE_MS) return true;
  return false;
}

// checkPass 已删除(2026-11-11 全面审计 R3 收尾):旧审批门时代的通行证校验,
// 会话化之后全仓库无任何调用方(gate.js 只 import 从未使用),属死代码。
// 其"设备指纹兜底放行"语义与现行 DG-SEC-002 口径(授权只认 vid)相悖,留着只会误导后来人。
// 审批门时代的 levelExpired 判定仍被保留导出(历史档案字段兼容),不受影响。

// (isAutomated 已迁 lib/request-identity.js,C9;顶部 re-export 引入。
//  语义不变:探针 x-probe 头最可靠,UA 特征兜底防第三方工具漏标)

function recordVisit(req, id, a) {
  // 自动化访问(测试/探针/无头浏览器)不计入真实访客
  if (isAutomated(req)) return;
  // 仅当“无任何外部代理 IP 头 且 源是回环”才跳过——这是本地开发/直连测试流量;
  // 走 Cloudflare 时真实访客 IP 在 cf-connecting-ip(或 socket 直接是访客 IP)中,一律计数,
  // 即便隧道回源使 socket 变成 ::1 也不误杀。
  var ip=realIP(req);
  var cf=req.headers['cf-connecting-ip'];
  var xff=req.headers['x-forwarded-for'];
  var isLoopback=!ip||ip==='127.0.0.1'||ip==='::1'||ip.startsWith('::ffff:127.')||ip==='localhost';
  if(isLoopback&&!cf&&!xff)return;
  // 去重:同一设备 60 秒内只计一次(防止 F5/自动刷新导致暴增)
  var dk=deviceKey(req);
  var now=Date.now();
  if(!gateData._visitRate)gateData._visitRate={};
  if(gateData._visitRate[dk]&&now-gateData._visitRate[dk]<60000)return;
  gateData._visitRate[dk]=now;
  if (Object.keys(gateData._visitRate).length > 5000) capKeys(gateData._visitRate, 4000);
  gateData.stats.total++;
  const d = todayStr();
  gateData.stats.byDay[d] = (gateData.stats.byDay[d] || 0) + 1;
  if (a) {
    // F2 诚实标注:此处与 identity.touchVisit 同语义,但 store 是底座——identity 依赖 store,
    // 反向 require 即成环(depcruise 硬闸)。档案计数两行留原地,门面 touchVisit 供上层消费方用。
    a.visits = (a.visits || 0) + 1;
    a.lastAccess = Date.now();
  }
  // 访问日志(统计页按 日/周/月/年 聚合,保留最近 1000 条;
  // 时间维度由 lib/retention.js 的 visits 保留期收口——老于保留期的明细会被清,条数上限照旧不削弱)
  if (!gateData.visits) gateData.visits = [];
  const entry = { t: Date.now(), id: id || null };
  gateData.visits.push(entry);
  if (gateData.visits.length > 1000) gateData.visits.splice(0, gateData.visits.length - 1000);
  // B5 拆双轨:shadow.visit 返回真实持久判定。true=明细已持久⇒免整库落盘;false=回旁路。
  // 注意 stats.total/byDay 与档案 visits/lastAccess 是低频聚合,仍靠后续任一冷路径 save 落盘
  // (与点击攒批同一豁免口径)。
  if (!shadow.visit(entry)) saveGateData();
}

module.exports = {
  DATA_FILE, gateData, loadGateData, saveGateData, saveGateDataSync, lastSaveResult,
  parseBrand, deviceKey, legacyDeviceKey, findByDevice, ownerAid, signId, todayStr,
  levelExpired, recordVisit, realIP, isAutomated, getApplicant, quotaKey, capKeys, capApplicants,
  trustedProxy, // 代理头(cf-connecting-ip / cf-ipcountry)可信吗 —— 与 realIP 同源判定,lib/geoip 复用
  SESSION_IDLE_MS, ensureSession, sessionValid, touchSession, revokeSession,
  authVid, isUnclaimedProfile, sessionRevoked, issueSession, resumeSession, rotateMt,
};

// ===================== 保留期清扫接线(DG-PRIV-001)=====================
// 启动点刻意放在 **server.js**(见 listen 回调),不放这里:store 是被所有 lib 依赖的底座,
// 而 retention 需要 store + client-errors(裁剪报错集合)。在底座里 require('./retention')
// 会造出 store→retention→client-errors→store 的循环依赖(depcruise no-circular 是硬门禁)。
// server.js 没人依赖它,单向不成环。(2026-11-18 第五轮审计更正:旧注释称 client-errors
// 依赖 admin 故环经 admin——D1 后 client-errors 已改直依赖 authz 叶子,环路径不再经 admin。)
// 一次 sweep 仍只调一次 saveGateData(),所以放 server 与放 store 在写盘次数上没有区别。
// 紧急闸 RETENTION_DISABLED=1 与"单测进程不自动启动"的口径由 server 侧接线自己守(见 server.js)。

