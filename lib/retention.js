// ===================== 访客数据保留期限与最小化清理(DG-PRIV-001) =====================
// 背景(外部审计):追踪系统持久化了大量访客数据(IP + 历史 IP、UA、canvas/WebGL/audio 指纹、
//   屏幕/时区/核数/内存、逐题答案、聊天、一念墙、访问记录、点击记录、客户端报错),但全部只有
//   "条数上限"(chat 100 / 一念 5000 / 报错 500 / 点击 5000 / 答题 200 / 档案 5000 LRU),
//   没有任何**时间维度**的清理 —— 不访问的老档案与沉底的老埋点会永久留在库里。
//   本模块就是补上的那一半:**每个集合一个保留期,过期即裁剪**,并且是这些数字的唯一源。
//
// 与条数上限的关系:**共存,不削弱**。各写入点的 cap 仍在原模块(lib/chat.js / lib/wishes.js /
//   lib/track.js / lib/quiz.js / lib/client-errors.js / lib/store.js 的 capApplicants·capKeys),
//   本模块只做时间维度的补充裁剪;两边的常量都在原处,测试钉住不被改小。
//
// 落盘纪律:saveGateData() 会把**整个 gateData 快照**序列化落库(SQLite 事务 + JSON 镜像),很贵。
//   所以一次 sweep 无论裁了多少个集合,**只调用一次 saveGateData()**;什么都没裁就一次都不调。
//   唯一的例外是 client_errors.json —— 它是独立的小文件、不在 gateData 快照里,由
//   lib/client-errors.js 自己写一次,不计入返回值里的 writes(那仍然是"全量快照写盘"的次数)。
//
// 安全垫(首轮与畸形数据):缺时间戳的条目一律**跳过而不是删**——"数据文件比最后一条记录还新、
//   但条目字段没有 t/ts"属于畸形而非老数据。需要时间维度却原本没有的两处(geo 缓存、档案历史 IP)
//   采用"先补记、下轮才生效"的策略:geoTs / ipsAt 在第一次见到时只写"本轮观测时刻",绝不当老数据清掉。
//
// 刻意**不做**的事(主人未拍板,属另一项议题):不做 IP 截断/哈希,不改任何身份判定口径。
//   也不动这些集合:quizPassed / vipPassed(门禁通行证,清掉等于逼人重新答题)、
//   stats.byDay(只有日粒度计数,是统计页年/月视图的底)、kickLog(管理员处置审计线索)、
//   uploads / photoCaptions / userLinks(归属与资产,删了就丢线索)、alerts(未处理的安全预警)。
//
// 接线:lib/store.js 底部在模块加载后启动 startRetention()(启动跑一次 + 每天一次,unref);
//   RETENTION_DISABLED=1 可整体停用(单测用它避开自动定时器,也给运维留一个紧急闸)。
//   优雅关闭建议调 stopRetention()(server.js 由主代理接线)。
const store = require('./store');

const DAY_MS = 24 * 60 * 60 * 1000;

// ===================== 保留期表(改口径只改这里;单位:天) =====================
// 数值取舍原则:① 前端/后台本来就只读最近 N 条,时间维度不会碰可见范围;
// ② 越接近"个人敏感内容 + 只对排障有用"的越短;③ 主人珍视的创作内容(一念/答题作答)留半年;
// ④ 身份与归属数据(访客档案)最长,且默认只标记不删。
const RETENTION_DAYS = {
  chat: 90, // 聊天室:公屏只渲染最近 100 条(条数上限已保证),90 天 = 一个季度的运营回看窗口;
            // 超一个季度没人回头看的公屏发言继续带着 dk(可关联到人的 UA 哈希)只剩风险
  wishes: 180, // 一念墙:公开墙最近 100 条、后台最近 300 条;一念是"心事/心愿"性质的内容,
               // 按半年留一次跨年度回看,之后由条数上限与本保留期共同收口
  clientErrors: 30, // 客户端报错:排障线索,30 天后再也没人去修;条目含 IP/UA/完整栈,
                    // 且同一错误靠 lastT 合并计数——按 lastT 判龄,仍在复发的永不老化
  linkClicks: 180, // 点击记录:单条最重(完整指纹 + IP + UA + 馆内坐标),用途是外链运营复盘;
                   // 半年足够覆盖"半年报 + 年度对照",再老的历史点击没有决策价值
  visits: 90, // 访问记录:{t,id} 明细,后台只取最近 300 条、统计页按日/周/月/年聚合;
              // 年/月口径来自 stats.byDay(永久保留的聚合计数),明细留 90 天足够定位个案
  quizAttempts: 180, // 答题记录:含逐题选项与问答题作答原文(最"像人"的内容);
                     // 后台只发最近 100 条,留半年与年度盘点同频(主人若要更短,这是第一个该改的)
  applicantIdle: 365, // 老访客档案:连续**一年**没有任何访问/会话活动才进入处理流程
  applicantQuarantine: 90, // 标记 expired 后再隔离 90 天(默认不删;只有显式开启删除才在隔离期满后动手)
  geo: 90, // IP→归属地缓存:是"把访客 IP 发给第三方 ip-api.com"的副产品,90 天后
           // 既没有统计用途也不该继续留着;仍被活跃档案当作当前 IP 的条目不参与删除(避免重复外呼)
  ipHistory: 180, // 档案里的历史 IP(a.ips):门禁/归属判定用的是**当前** ip 与指纹,
                  // 历史 IP 只是"这人换过网络"的线索;半年足够,当前 a.ip 永不因保留期被丢
  rateTable: 7, // 限流/防刷表(chatRate / wishRate / _visitRate / renameRate):窗口本身只有分钟~日粒度,
                // 键是 dk/vid(可关联到人),留 7 天纯属无人回收的死键
};

function buildMs(days) {
  const out = {};
  for (const [k, v] of Object.entries(days)) out[k] = v * DAY_MS;
  return out;
}
const RETENTION_MS = buildMs(RETENTION_DAYS);

const SWEEP_INTERVAL_MS = DAY_MS; // 每天一轮(启动时先跑一次)

// ===================== 小工具 =====================
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 取条目的时间维度:按候选键顺序找第一个有限数字;找不到返回 null(= 畸形,跳过不删) */
function entryTime(item, keys) {
  if (!item || typeof item !== 'object') return null;
  for (const k of keys) if (isNum(item[k])) return item[k];
  return null;
}

function has(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/** IPv4-mapped IPv6 (::ffff:1.2.3.4) 归一 —— 档案的当前 IP 与历史 IP 列表写法可能不一致 */
function cleanIp(ip) {
  return String(ip || '').replace(/^::ffff:/i, '');
}

/**
 * 数组集合的时间裁剪(**原地压缩**,保持各模块持有的数组引用不变)。
 * @returns {number} 实际(或预览中将会)移除的条数
 */
function sweepArray(arr, keys, keepMs, now, preview) {
  if (!Array.isArray(arr)) return 0;
  let removed = 0;
  if (preview) {
    for (const it of arr) {
      const t = entryTime(it, keys);
      if (t !== null && now - t > keepMs) removed++;
    }
    return removed;
  }
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const t = entryTime(arr[r], keys);
    if (t !== null && now - t > keepMs) { removed++; continue; }
    if (w !== r) arr[w] = arr[r];
    w++;
  }
  if (w < arr.length) arr.length = w; // 长度不变时不产生 mutation 噪声
  return removed;
}

/**
 * 键值表(限流/防刷)的时间裁剪:值既可能是时间戳本身,也可能是 {.., t} 形态。
 */
function sweepKeyedTable(obj, pick, keepMs, now, preview) {
  if (!obj || typeof obj !== 'object') return 0;
  let removed = 0;
  for (const k of Object.keys(obj)) {
    const t = pick(obj[k]);
    if (t === null || now - t <= keepMs) continue; // 缺时间戳:不动
    removed++;
    if (!preview) delete obj[k];
  }
  return removed;
}

// ===================== 访客档案:标记 / (可选)删除 =====================
// 判定刻意保守:一年无活动且"有资格被清理"(纯匿名、未被认领、未被管理员处理、名下无私有资产、
//   IP 未被后台点名)才打 **标记**(a.expiredAt);踢出/待批/已批准且曾上传过的连标记都不打。
//   标记本身不改 status、不参与任何门禁判定,所以 entryGate / findVisitorId / 归属逻辑行为不变
//   (后台只会多看见一个字段)。真删只在 RETENTION_DELETE_APPLICANTS=1 时发生,
//   且必须先标记、再隔离 RETENTION_DAYS.applicantQuarantine 天。

/** 档案最后一次"活动时刻":取所有可用时间维度的最大值;一个都没有 = 畸形,一律不动 */
function profileActivityTime(a) {
  const cands = [];
  for (const k of ['lastAccess', 'applyTime', 'approveTime', 'firstAccess']) if (isNum(a[k])) cands.push(a[k]);
  const s = a.sess;
  if (s && typeof s === 'object') {
    // 注意:不看 expiresAt(那是个未来时刻,会把"30 天前活跃"算成"刚刚")
    for (const k of ['lastSeen', 'issuedAt', 'revokedAt']) if (isNum(s[k])) cands.push(s[k]);
  }
  return cands.length ? Math.max(...cands) : null;
}

/** 是否被管理员处理过(有任何处置/标注痕迹就绝不自动删:删了就丢审计线索) */
function adminTouched(a) {
  if (a.status && a.status !== 'approved') return true; // kicked / reapply / denied / history
  if (a.kickedTime || a.kickReason || a.kickedFrom || a.matchHint) return true;
  if (a.reapplyTime || a.reapplyMsg || a.approveTime || a.deniedTime) return true;
  if (typeof a.note === 'string' && a.note.trim()) return true;
  if ((a.authVersion || 0) > 0) return true; // 被吊销过 = 管理员动过手
  const s = a.sess;
  if (s && typeof s === 'object' && (s.revoked || isNum(s.revokedAt))) return true;
  return false;
}

/**
 * 一次性把「哪些身份/设备键名下有资产、哪些 IP 被后台点名」建成索引(每轮 sweep 只建一次)。
 * 先建索引再逐档案判定,是因为档案可达 5000 个,逐档案遍历 uploads/alerts 会退化成 O(n·m)。
 */
function buildAssetIndex() {
  const g = store.gateData;
  const idx = { aids: new Set(), dks: new Set(), alertDks: new Set(), watchedIps: new Set(), blockAll: false };
  for (const u of Object.values(g.uploads || {})) {
    if (!u || typeof u !== 'object') continue;
    if (u.aid) idx.aids.add(u.aid);
    else if (u.dk) idx.dks.add(u.dk); // 存量无 aid 的记录按 dk 也算这个档案的资产
    else if (u.pending) idx.blockAll = true; // 说不清归属的待审展品:本轮谁的档案都不动
  }
  for (const l of Array.isArray(g.userLinks) ? g.userLinks : []) {
    if (!l || typeof l !== 'object') continue;
    if (l.aid) idx.aids.add(l.aid);
    else if (l.dk) idx.dks.add(l.dk);
  }
  for (const al of Array.isArray(g.alerts) ? g.alerts : []) {
    if (al && !al.dismissed && al.dk) idx.alertDks.add(al.dk); // 未处理的安全预警 = 线索不能丢
  }
  for (const list of [g.blockedIps, g.watchIps]) {
    if (Array.isArray(list)) for (const ip of list) if (ip) idx.watchedIps.add(cleanIp(ip));
  }
  return idx;
}

/** 名下是否有私有资产(上传归属 / 待审核 / 访客链接)或未处理预警——命中一条就不许自动删 */
function hasPrivateAssets(id, a, idx) {
  const i = idx || buildAssetIndex();
  if (i.blockAll) return true;
  if (i.aids.has(id)) return true;
  if (a.dk && (i.dks.has(a.dk) || i.alertDks.has(a.dk))) return true;
  return false;
}

/** 该 IP(当前或历史)是否被后台名单点名(拉黑 / 重点关注)——点名过的档案不自动删 */
function ipWatched(ip, idx) {
  if (!ip) return false;
  const i = idx || buildAssetIndex();
  return i.watchedIps.has(cleanIp(ip));
}

/** 删除候选:必须"纯匿名 + 从未被认领 + 未被管理员处理 + 无私有资产 + IP 未被点名"全中 */
function isDeletableProfile(id, a, idx) {
  const i = idx || buildAssetIndex();
  if (typeof store.isUnclaimedProfile === 'function' && !store.isUnclaimedProfile(a)) return false;
  if (a.status && a.status !== 'approved') return false;
  if (adminTouched(a)) return false;
  if (hasPrivateAssets(id, a, i)) return false;
  if (ipWatched(a.ip, i)) return false;
  if (Array.isArray(a.ips) && a.ips.some((x) => ipWatched(x, i))) return false;
  return true;
}

function deleteApplicantsEnabled() {
  return process.env.RETENTION_DELETE_APPLICANTS === '1';
}

/**
 * 档案的历史 IP 时间维度(a.ips 保持"字符串数组"原形状,时间戳平行放在 a.ipsAt,同下标)。
 * 当前 a.ip 永不因保留期被丢;缺 ipsAt(含存量档案)只补记、本轮不删。
 */
function sweepIpHistory(a, now, preview) {
  if (!Array.isArray(a.ips) || !a.ips.length) return 0;
  if (!Array.isArray(a.ipsAt) || a.ipsAt.length !== a.ips.length) {
    if (!preview) a.ipsAt = a.ips.map(() => 0); // 0 = 未知时刻,下面按"畸形"跳过
    return 0;
  }
  const current = cleanIp(a.ip);
  let removed = 0;
  let w = 0;
  for (let r = 0; r < a.ips.length; r++) {
    const ip = a.ips[r];
    const t = isNum(a.ipsAt[r]) && a.ipsAt[r] > 0 ? a.ipsAt[r] : null;
    const keep = t === null || (current && cleanIp(ip) === current) || now - t <= RETENTION_MS.ipHistory;
    if (!keep) { removed++; continue; }
    if (w !== r) { a.ips[w] = ip; a.ipsAt[w] = a.ipsAt[r]; }
    w++;
  }
  if (!preview) {
    if (w < a.ips.length) a.ips.length = w;
    a.ipsAt.length = w;
  }
  return removed;
}

/**
 * IP→归属地缓存:geo 的值是字符串(多个消费方直接当字符串用),不能塞时间戳,
 * 故时间维度记在旁表 gateData.geoTs(ip -> 首次被本轮观测到的时刻)。
 * 仍被某个档案当作**当前 IP** 的条目不参与删除,免得每 90 天就再向第三方查一次同一个 IP。
 */
function sweepGeo(now, preview) {
  const g = store.gateData;
  const geo = g.geo;
  if (!geo || typeof geo !== 'object') return 0;
  const keys = Object.keys(geo);
  if (!keys.length) return 0;
  if (!preview && (!g.geoTs || typeof g.geoTs !== 'object')) g.geoTs = {};
  const ts = g.geoTs && typeof g.geoTs === 'object' ? g.geoTs : {};
  const live = new Set();
  for (const a of Object.values(g.applicants || {})) {
    if (a && a.ip) live.add(cleanIp(a.ip));
  }
  let removed = 0;
  for (const ip of keys) {
    if (live.has(cleanIp(ip))) continue; // 当前仍在用:不删也不记,免得反复向第三方重查同一个 IP
    if (!has(ts, ip) || !isNum(ts[ip]) || ts[ip] <= 0) {
      // 首轮补记:缺时间戳不等于老数据(preview 不落盘,所以预览里这一轮永远显示 0)
      if (!preview) ts[ip] = now;
      continue;
    }
    if (now - ts[ip] > RETENTION_MS.geo) {
      removed++;
      if (!preview) {
        delete geo[ip];
        delete ts[ip];
      }
    }
  }
  // 旁表里已经没有对应 geo 值的死键一并回收
  if (!preview) {
    for (const ip of Object.keys(ts)) if (!has(geo, ip)) delete ts[ip];
  }
  return removed;
}

// ===================== 一轮清扫 =====================
let timer = null;
let sweeps = 0;

/**
 * 按时间维度裁剪各集合。时钟可注入(测试用),生产不传即用 Date.now()。
 * @param {{now?:number, preview?:boolean}} [opts] preview=true 时只统计不修改、绝不落盘
 * @returns {{removed:object, marked:object, writes:number, preview:boolean, now:number}}
 *   removed.applicants 只在 RETENTION_DELETE_APPLICANTS=1 时才可能 >0;
 *   removed.clientErrors = gateData.clientErrors(track.js 那条信道)+ client_errors.json 两处之和;
 *   writes = 本次对 gateData 快照的写盘次数(0 或 1)。
 */
function runSweep(opts) {
  const o = opts || {};
  const now = isNum(o.now) ? o.now : Date.now();
  const preview = !!o.preview;
  const g = store.gateData;
  const removed = {
    chat: 0, wishes: 0, clientErrors: 0, linkClicks: 0, visits: 0,
    quizAttempts: 0, applicants: 0, geo: 0, ipHistory: 0, rate: 0,
  };
  const marked = { applicants: 0, applicantsUnmarked: 0 };
  let dirty = false;
  const take = (n) => { if (n > 0) dirty = true; return n; };

  // 1) 聊天(100 条条数上限照旧在 lib/chat.js)
  removed.chat = take(sweepArray(g.chat, ['ts', 't'], RETENTION_MS.chat, now, preview));
  // 2) 一念墙(5000 条上限照旧在 lib/wishes.js)
  removed.wishes = take(sweepArray(g.wishes, ['ts', 't'], RETENTION_MS.wishes, now, preview));
  // 3) 客户端报错 —— gateData.clientErrors(track.js,500 条上限)
  removed.clientErrors = take(sweepArray(g.clientErrors, ['t', 'ts'], RETENTION_MS.clientErrors, now, preview));
  //    另一份独立存储 client_errors.json(500 条上限在 lib/client-errors.js),它自己写自己的小文件
  removed.clientErrors += sweepClientErrorsFile(now, preview);
  // 4) 点击记录(linkClicks 5000 条上限在 lib/track.js)
  removed.linkClicks = take(sweepArray(g.linkClicks, ['t'], RETENTION_MS.linkClicks, now, preview));
  // 5) 访问记录(1000 条上限在 lib/store.js recordVisit)
  removed.visits = take(sweepArray(g.visits, ['t'], RETENTION_MS.visits, now, preview));
  // 6) 答题记录(200 条上限在 lib/quiz.js)
  removed.quizAttempts = take(sweepArray(g.quizAttempts, ['t'], RETENTION_MS.quizAttempts, now, preview));

  // 7) 访客档案:只有"确实有资格被清理"的老档案才进标记流程(默认只标记、不删),
  //    顺带收历史 IP 的时间维度
  const applicants = g.applicants || {};
  const assetIdx = buildAssetIndex();
  const deletable = deleteApplicantsEnabled();
  for (const [id, a] of Object.entries(applicants)) {
    if (!a || typeof a !== 'object') continue;
    const seen = profileActivityTime(a);
    if (seen === null) continue; // 无任何时间维度:畸形,不动(也不标记)
    const idle = now - seen > RETENTION_MS.applicantIdle;
    // 被管理员处理过 / 名下有资产 / 已被真人认领(有昵称或指纹)的档案**连标记都不打**——
    // expiredAt 的含义因此很干净:「这是一份有资格被自动清理的候选」,后台不会误读成"某人过期了"
    const eligible = idle && isDeletableProfile(id, a, assetIdx);
    if (eligible && !a.expiredAt) {
      marked.applicants++;
      dirty = true;
      if (!preview) { a.expiredAt = now; a.expiredSeenAt = seen; }
    } else if (a.expiredAt && !eligible) {
      marked.applicantsUnmarked++; // 又活跃了,或新增了资产/认领线索 → 撤标
      dirty = true;
      if (!preview) { delete a.expiredAt; delete a.expiredSeenAt; }
    } else if (eligible && a.expiredAt && deletable && now - a.expiredAt > RETENTION_MS.applicantQuarantine) {
      removed.applicants++;
      dirty = true;
      if (!preview) delete applicants[id];
      continue;
    }
    removed.ipHistory += take(sweepIpHistory(a, now, preview));
  }

  // 8) IP→归属地缓存
  removed.geo = take(sweepGeo(now, preview));

  // 9) 限流/防刷死键回收(纯缓存,行为中性:窗口粒度最长也才"按天")
  removed.rate += take(sweepKeyedTable(g.chatRate, (v) => (isNum(v) ? v : entryTime(v, ['t'])), RETENTION_MS.rateTable, now, preview));
  removed.rate += take(sweepKeyedTable(g.wishRate, (v) => entryTime(v, ['t']), RETENTION_MS.rateTable, now, preview));
  removed.rate += take(sweepKeyedTable(g.renameRate, (v) => (isNum(v) ? v : null), RETENTION_MS.rateTable, now, preview));
  removed.rate += take(sweepKeyedTable(g._visitRate, (v) => (isNum(v) ? v : null), RETENTION_MS.rateTable, now, preview));

  // 全集合裁剪完毕 => **一次**落盘(全量快照写很贵,严禁每集合各写一次)
  let writes = 0;
  if (!preview && dirty) {
    store.saveGateData();
    writes = 1;
  }
  sweeps++;
  return { removed, marked, writes, preview, now };
}

/**
 * client_errors.json(独立小文件)的裁剪:走 lib/client-errors.js 导出的 sweeper。
 * 惰性 require + try/catch:该模块不可用/未导出时**宁可不删**,绝不让清扫崩掉。
 */
function sweepClientErrorsFile(now, preview) {
  try {
    const ce = require('./client-errors');
    if (typeof ce.sweepExpiredClientErrors !== 'function') return 0;
    return ce.sweepExpiredClientErrors({ now, keepMs: RETENTION_MS.clientErrors, preview }) || 0;
  } catch (e) {
    console.error('[retention] client_errors 清理跳过:', e && (e.message || e));
    return 0;
  }
}

/** 只统计不落盘的预览(后台若要"清理预览"入口,直接接这个) */
function previewSweep(opts) {
  return runSweep(Object.assign({}, opts, { preview: true }));
}

// ===================== 周期调度 =====================
function disabled() {
  return process.env.RETENTION_DISABLED === '1';
}

/** 启动保留期清扫:立刻跑一次 + 每天一次;定时器必须 unref(否则拖住进程退出/测试挂住) */
function startRetention() {
  if (timer || disabled()) return false;
  try { runSweep(); } catch (e) { console.error('[retention] 启动清扫失败(不影响服务):', e && (e.message || e)); }
  timer = setInterval(() => {
    try { runSweep(); } catch (e) { console.error('[retention] 周期清扫失败:', e && (e.message || e)); }
  }, SWEEP_INTERVAL_MS);
  if (timer.unref) timer.unref();
  return true;
}

/** 停掉调度(测试与优雅关闭用);幂等 */
function stopRetention() {
  if (!timer) return false;
  clearInterval(timer);
  timer = null;
  return true;
}

function retentionOn() { return !!timer; }
function sweepCount() { return sweeps; }

module.exports = {
  RETENTION_DAYS, RETENTION_MS, SWEEP_INTERVAL_MS,
  runSweep, previewSweep,
  startRetention, stopRetention, retentionOn, sweepCount, deleteApplicantsEnabled,
  // 供测试与排查复用的判定器(纯读,不改状态)
  profileActivityTime, adminTouched, hasPrivateAssets, isDeletableProfile, sweepIpHistory,
};
