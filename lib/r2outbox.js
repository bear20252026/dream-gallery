// ===================== R2 同步持久待发台账(2026-10-11 外部审计 R2 P2:可靠化) =====================
// 要治的病:媒体镜像(r2Put/r2Delete)全是 fire-and-forget —— 进程内那 2 次重试一旦用完,
//   **这个对象就永久缺席 R2**:源站有文件、CDN 没有 ⇒ 长期分歧(删掉的那侧同理:源站已删、R2 还在)。
// 本模块是"最后一次尝试之后"的那一层:**台账落盘 + 到期退避重试 + 成功才出账**,进程重启也接得上。
//
// ⚠️ 三条硬规矩(改动前先看):
// 1) **台账绝不进 gateData**。saveGateData() 是整库序列化(AGENTS 明记的写放大主因),
//    而"每次上传"都要记一笔。故本模块落**独立小文件**,且只在"真有东西要存"时写(全成功路径零字节落盘)。
// 2) **写盘一律去抖批量**(FLUSH_MS 窗口 / FLUSH_BATCH 条数,谁先到算谁),定时器**全部 unref** ——
//    台账永不拖住进程退出(与 .chunks GC、埋点批量、AI 用量台账同一口径)。
// 3) **淘汰必须可见**。台账有上限,超限淘汰最旧 = 放弃那条的自动重试(源站文件才是权威,
//    内容本身没丢),所以淘汰一定 console.warn 点名 key + 给出手动补推的办法,绝不静默。
//
// 台账文件位置与公网可见性:默认 <ROOT>/.r2-outbox.json(与 .tts-cache/ 同级同类的点文件)。
//   lib/security.js staticDenied() 三重挡住公网:①文件名以点开头 ②任意路径段以点开头
//   ③根级 .json(仅 manifest.json 豁免)+ 根级白名单登记表不含它。
//   想搬到 web root 之外:设 R2_OUTBOX_DIR=/opt/gallery-state(或 R2_OUTBOX_FILE 指绝对路径)。
//
// 参数一览(全部可用环境变量覆盖,改完 pm2 restart --update-env 生效;不需改代码):
//   R2_OUTBOX_FILE / R2_OUTBOX_DIR / R2_OUTBOX_DISABLE=1(只关台账,不关同步本身)
//   R2_OUTBOX_MAX / R2_OUTBOX_FLUSH_MS / R2_OUTBOX_FLUSH_BATCH / R2_OUTBOX_PUMP_MS
//   R2_OUTBOX_INFLIGHT / R2_OUTBOX_BURST_INFLIGHT / R2_OUTBOX_BACKOFF_MS / R2_OUTBOX_BACKOFF_CAP_MS
//
// 计数分工(与 lib/r2sync.js 不重复):r2sync 的 stats 记**传输层**(一次调用最多 3 个 HTTP 请求);
//   本模块记**对象层台账**(待办/退避/淘汰/落盘次数)。读数只走 outboxStats(),它顺手把
//   r2sync 的传输计数挂在 transport 字段上(观测面收成一个,不用两处翻)。
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');

const DEFAULT_FILE_NAME = '.r2-outbox.json';
const LEDGER_VER = 1;

// ---------- 参数(惰性读 env:主人改了 .env 只要重启就生效,测试也能逐用例改) ----------
function envNum(name, def) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return def;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : def;
}
const DEF = {
  MAX_ENTRIES: 2000,        // 台账条数上限(超限淘汰最旧 + 可见日志)
  FLUSH_MS: 2000,           // 去抖窗口:窗口内的多次变更合并成一次落盘
  FLUSH_BATCH: 20,          // 攒够这么多条不等窗口立刻落盘(批量上传/预热的主路径)
  PUMP_INTERVAL_MS: 60000,  // 周期补推:每分钟看一次有没有到期的
  MAX_INFLIGHT: 3,          // 周期 pump 同时在途的对象数上限(2 核小机,别把上行带宽吃光)
  MAX_BURST_INFLIGHT: 6,    // 上传/删除事件触发的即时补推可临时放宽到这里
  BACKOFF_CAP_MS: 21600000, // 退避封顶 6h(永不放弃,但不再刷屏)
};
// 退避阶梯(第 N 次失败之后隔多久再试):30s → 2m → 10m → 1h → 6h,第 7 次起永远 6h
// 最后一档就是封顶值 ⇒ "永不放弃但不再刷屏";刻意不加 jitter:r2sync 内部的 3 次 HTTP 重试
// 已经带 jitter,台账这层要的是**可预测、可单测钉死**的阶梯(主人改口径只动这一行 + 一个环境变量)。
const DEFAULT_BACKOFF = [30000, 120000, 600000, 3600000, 21600000];
const PARAMS = {
  maxEntries: () => envNum('R2_OUTBOX_MAX', DEF.MAX_ENTRIES),
  flushMs: () => envNum('R2_OUTBOX_FLUSH_MS', DEF.FLUSH_MS),
  flushBatch: () => envNum('R2_OUTBOX_FLUSH_BATCH', DEF.FLUSH_BATCH),
  pumpMs: () => envNum('R2_OUTBOX_PUMP_MS', DEF.PUMP_INTERVAL_MS),
  maxInflight: () => envNum('R2_OUTBOX_INFLIGHT', DEF.MAX_INFLIGHT),
  maxBurstInflight: () => envNum('R2_OUTBOX_BURST_INFLIGHT', DEF.MAX_BURST_INFLIGHT),
  backoffCapMs: () => envNum('R2_OUTBOX_BACKOFF_CAP_MS', DEF.BACKOFF_CAP_MS),
  ladder: () => {
    const raw = String(process.env.R2_OUTBOX_BACKOFF_MS || '').trim();
    if (!raw) return DEFAULT_BACKOFF.slice();
    const list = raw.split(',').map(s => Math.round(Number(s.trim()))).filter(n => Number.isFinite(n) && n > 0);
    return list.length ? list : DEFAULT_BACKOFF.slice();
  },
};
// 第 attempts 次失败之后隔多久再试(attempts 从 1 起算 ⇒ 1→30s、2→2m、3→10m、4→1h、5 次及以后→6h 封顶)
function backoffMs(attempts) {
  const list = PARAMS.ladder();
  const i = Math.max(0, Math.round(Number(attempts) || 1) - 1);
  return Math.min(PARAMS.backoffCapMs(), list[Math.min(i, list.length - 1)]);
}
function outboxFile() {
  const f = String(process.env.R2_OUTBOX_FILE || '').trim();
  if (f) return path.resolve(f);
  const d = String(process.env.R2_OUTBOX_DIR || '').trim();
  if (d) return path.join(path.resolve(d), DEFAULT_FILE_NAME);
  return path.join(ROOT, DEFAULT_FILE_NAME);
}
function disabled() { return process.env.R2_OUTBOX_DISABLE === '1'; }
function paramsSnapshot() {
  return {
    file: outboxFile(),
    disabled: disabled(),
    maxEntries: PARAMS.maxEntries(),
    flushMs: PARAMS.flushMs(),
    flushBatch: PARAMS.flushBatch(),
    pumpIntervalMs: PARAMS.pumpMs(),
    maxInflight: PARAMS.maxInflight(),
    maxBurstInflight: PARAMS.maxBurstInflight(),
    backoffMs: PARAMS.ladder(),
    backoffCapMs: PARAMS.backoffCapMs(),
  };
}

// ---------- 状态 ----------
const ledger = new Map(); // key(`${dir}/${name}`) -> entry
const inflight = new Set(); // 正在尝试的 key(同 key 只一次在途:即时补推与周期 pump 共用这把闸)
let genSeq = 1; // 每次"入账"是一个新事件 ⇒ gen 递增;在途尝试据此判断"推的内容是否已经过期"
let loaded = false; // 台账文件已读进内存(惰性:第一次用到才读)
let fileExists = false; // 磁盘上目前/曾经有台账文件 —— 空台账且从未有文件时一个字节都不落
let dirty = 0; // 已改内存未落盘的次数
let flushTimer = null;
let pumpTimer = null;
let started = false;
let stopped = false; // stopOutbox() 之后不再自行起定时器(优雅关闭)
const totals = { succeeded: 0, failed: 0, dropped: 0, evicted: 0, writes: 0, lastFlushAt: 0 };
let cfSkipWarned = false;

function clip(s, n) { return String(s === undefined || s === null ? '' : s).replace(/[\r\n]+/g, ' ').slice(0, n || 160); }
function keyOf(dir, name) { return `${String(dir || '').replace(/^\/+|\/+$/g, '')}/${String(name || '').replace(/^\/+/, '')}`; }
function ensureLoaded() { if (!loaded) load(); return loaded; }

// ---------- 读盘(损坏不崩、能重建) ----------
function load() {
  loaded = true;
  const file = outboxFile();
  let raw;
  try {
    if (!fs.existsSync(file)) { fileExists = false; return false; }
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.warn('[r2outbox] 台账文件读不到(跳过读盘,内存台账照常工作):', file, e && e.message);
    return false;
  }
  fileExists = true;
  let parsed = null;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    // 半截 JSON(写盘途中掉电/被截断)是**可预期**的:重建即可,台账本身不是权威数据
    console.warn(
      `[r2outbox] 台账文件损坏,重建为空台账(下次变更即覆盖重写;源站文件是权威,内容没丢,` +
      `只是这批自动重试要人工补:node scripts/r2-upload-models-rest.cjs <模型路径> 或重新上传媒体)` +
      ` —— ${file} ${e && e.message};头部 ${Math.min(120, raw.length)} 字节=${clip(raw, 120)}`
    );
    return false;
  }
  const rows = parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
  let skipped = 0;
  for (const r of rows) {
    const e = sanitize(r);
    if (e) ledger.set(e.key, e); else skipped++;
  }
  if (skipped) console.warn(`[r2outbox] 台账里有 ${skipped} 条形态不合法的记录,已忽略`);
  enforceCap('读盘');
  return true;
}
function sanitize(r) {
  if (!r || typeof r !== 'object') return null;
  const dir = clip(r.dir, 24); const name = clip(r.name, 240);
  if (!name) return null;
  const op = r.op === 'delete' ? 'delete' : 'put';
  const key = clip(r.key, 300) || keyOf(dir, name);
  const num = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : d; };
  return {
    key, dir, name,
    srcPath: op === 'put' ? clip(r.srcPath, 1024) : '',
    op,
    attempts: num(r.attempts, 0),
    nextRetryAt: num(r.nextRetryAt, 0),
    lastError: clip(r.lastError, 160),
    ts: num(r.ts, Date.now()),
    gen: genSeq++, // 内存字段,序列化时剥掉:读盘也发一个代次,保证"在途期间重新入账"一定能被识别
  };
}
function serialize(e) {
  return {
    key: e.key, dir: e.dir, name: e.name, srcPath: e.srcPath || '', op: e.op,
    attempts: e.attempts, nextRetryAt: e.nextRetryAt, lastError: e.lastError || '', ts: e.ts,
  };
}

// ---------- 写盘(去抖批量;空台账且从未有文件 ⇒ 零字节) ----------
function touch() {
  if (disabled()) return;
  if (!ledger.size && !fileExists) { dirty = 0; return; } // 全成功路径:压根不碰磁盘
  dirty++;
  if (dirty >= PARAMS.flushBatch()) writeNow();
  else scheduleFlush();
}
function scheduleFlush() {
  if (stopped || flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; writeNow(); }, PARAMS.flushMs());
  if (flushTimer && typeof flushTimer.unref === 'function') flushTimer.unref();
}
function writeNow() {
  const file = outboxFile();
  const entries = Array.from(ledger.values()).map(serialize);
  try {
    if (!entries.length) {
      // 全部出账 ⇒ 把文件清掉(不留"空台账"这种看着像有事的孤儿)
      if (fileExists) { try { fs.unlinkSync(file); } catch (e) {} }
      fileExists = false; dirty = 0; totals.lastFlushAt = Date.now();
      return true;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ v: LEDGER_VER, updatedAt: Date.now(), count: entries.length, entries }));
    try { fs.renameSync(tmp, file); }
    catch (e) {
      // Windows 上目标被占用时 rename 会 EPERM:退回覆盖写(台账是幂等小文件,不需要原子性到极端)
      try { fs.writeFileSync(file, fs.readFileSync(tmp)); fs.unlinkSync(tmp); }
      catch (e2) { console.error('[r2outbox] 写失败', e && e.message, e2 && e2.message); throw e2; }
    }
    fileExists = true; dirty = 0; totals.writes++; totals.lastFlushAt = Date.now();
    return true;
  } catch (e) {
    console.warn('[r2outbox] 台账落盘失败(内存台账照常,下次变更再试):', e && e.message);
    try { fs.unlinkSync(file + '.tmp'); } catch (_) {}
    return false;
  }
}
// 立即落盘(供优雅关闭与测试);返回落盘前排着的条数
function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const n = dirty;
  writeNow();
  return n;
}

// ---------- 入账 ----------
function enforceCap(reason) {
  const max = PARAMS.maxEntries();
  if (ledger.size <= max) return 0;
  let removed = 0;
  while (ledger.size > max) {
    // 淘汰最旧(ts 最小)且不在途的:在途的那条此刻正在推,动了它等于白推一轮
    let victim = null;
    for (const e of ledger.values()) {
      if (inflight.has(e.key)) continue;
      if (!victim || e.ts < victim.ts) victim = e;
    }
    if (!victim) break;
    ledger.delete(victim.key);
    totals.evicted++; removed++;
    console.warn(
      `[r2outbox] 台账已满(${max},${reason}),淘汰最旧条目并**放弃它的自动重试**:${victim.key}` +
      `(挂了 ${victim.attempts} 次,最后一次 ${victim.lastError || '无错误信息'})` +
      ` —— 源站文件是权威,内容没丢,丢的只是"以后自己再试一次";` +
      `R2 可能仍缺席该对象,需人工补推(scripts/r2-upload*.cjs 或后台重传)。累计淘汰 ${totals.evicted} 条`
    );
  }
  if (removed) touch();
  return removed;
}
// 入账一条"该对象应当存在于 R2"
function enqueuePut(dir, name, srcPath) {
  if (disabled()) return null;
  if (!dir && !name) return null;
  ensureLoaded();
  const key = keyOf(dir, name);
  const now = Date.now();
  const prev = ledger.get(key);
  const e = prev || { key, dir: String(dir || ''), name: String(name || ''), op: 'put' };
  e.dir = String(dir || ''); e.name = String(name || ''); e.op = 'put';
  e.srcPath = String(srcPath || '');
  e.ts = now;              // 新的镜像事件:排队位置退到最后(淘汰按 ts 挑最旧)
  e.attempts = prev ? prev.attempts : 0;
  e.nextRetryAt = 0;       // 到期即试(即时补推会马上拿它)
  e.lastError = '';
  e.gen = genSeq++;        // 新事件 ⇒ 新代次:在途的那次尝试成功后不许替这次出账
  ledger.set(key, e);
  enforceCap('入账');
  touch();
  return ledger.get(key);
}
// 入账一条"该对象应当从 R2 消失"(源站已删 ⇒ 反向分歧也要自愈)
function enqueueDelete(dir, name) {
  if (disabled()) return null;
  ensureLoaded();
  const key = keyOf(dir, name);
  const prev = ledger.get(key);
  if (prev && prev.op === 'delete' && prev.attempts === 0 && !inflight.has(key)) {
    prev.ts = Date.now(); prev.nextRetryAt = 0; prev.gen = genSeq++;
    touch();
    return prev;
  }
  const e = {
    key, dir: String(dir || ''), name: String(name || ''), srcPath: '', op: 'delete',
    attempts: 0, nextRetryAt: 0, lastError: '', ts: Date.now(), gen: genSeq++,
  };
  ledger.set(key, e);
  enforceCap('入账');
  touch();
  return ledger.get(key);
}
function drop(key, why) {
  if (!ledger.has(key)) return false;
  ledger.delete(key);
  totals.dropped++;
  if (why) console.warn(`[r2outbox] 出账(不再重试)${key}:${why}`);
  touch();
  return true;
}
// 出账且说明理由(源文件没了/模块不可用/未配置 CF —— 这类"重试一百次也不会有结果"的账要摘掉,
// 但必须说出来:静默出账等于把分歧藏起来)
function skip(key, why) {
  drop(key, why);
  return 'skipped';
}

// ---------- 尝试一次(唯一的出网点;成功才出账) ----------
async function attempt(entry) {
  const key = entry.key;
  if (inflight.has(key)) return 'pending'; // 同 key 只一次在途
  inflight.add(key);
  const gen = entry.gen;
  let res = false;
  let err = '';
  let early = null;
  try {
    const m = require('./r2sync'); // 惰性 require:单测在 require 之前打 require.cache 桩即可全拦
    if (entry.op === 'delete') {
      if (typeof m.r2Delete !== 'function') early = skip(key, 'r2Delete 不可用(r2sync 模块异常)');
      else {
        res = await m.r2Delete(entry.dir, entry.name);
        if (res === false) err = 'r2Delete 返回 false';
      }
    } else {
      if (typeof m.r2Put !== 'function') early = skip(key, 'r2Put 不可用(r2sync 模块异常)');
      else if (!entry.srcPath) early = skip(key, '条目没有 srcPath,无法补推(请重新上传该媒体)');
      else if (!fs.existsSync(entry.srcPath)) early = skip(key, `源文件已不在(${entry.srcPath}),无从补推`);
      else {
        res = await m.r2Put(entry.dir, entry.name, entry.srcPath);
        if (res === false) err = 'r2Put 返回 false';
      }
    }
  } catch (e) {
    res = false;
    err = (e && e.message) || 'r2 调用抛异常';
  }
  inflight.delete(key);
  if (early) return early;
  const cur = ledger.get(key);
  if (!cur) return 'dropped'; // 期间被别的出账路径摘掉(淘汰/源文件消失)
  if (cur.gen !== gen) {
    // 在途期间该键又入账一次(例如上传后压缩又镜像同一对象)⇒ 内容已经换了,
    // 这次成功只对"旧内容"生效:保持到期即试,由下一轮把新内容推上去(仍是同 key 一次在途)
    cur.nextRetryAt = 0;
    touch();
    return 'pending';
  }
  if (res === true) {
    ledger.delete(key);
    totals.succeeded++;
    touch();
    return 'ok';
  }
  if (res === null) {
    // CF_R2_TOKEN/ACCOUNT 未配置(本地开发):重试一百次也不会有结果,出账 + 只说一次
    if (!cfSkipWarned) {
      cfSkipWarned = true;
      console.warn('[r2outbox] 未配置 CF_R2_TOKEN/CF_R2_ACCOUNT ⇒ R2 同步整体跳过,台账不再积压条目(配置后 pm2 restart 即恢复)');
    }
    return skip(key, '未配置 CF,重试无意义');
  }
  cur.attempts = (cur.attempts || 0) + 1;
  cur.lastError = clip(err || 'r2 调用失败');
  cur.nextRetryAt = Date.now() + backoffMs(cur.attempts);
  totals.failed++;
  // 刷屏控制:头两次与每第十次说一次(永不放弃,但不每小时吼一嗓子)
  if (cur.attempts <= 2 || cur.attempts % 10 === 0) {
    console.warn(
      `[r2outbox] 第 ${cur.attempts} 次失败 ${cur.key}(${cur.lastError})` +
      ` ⇒ ${Math.round(cur.nextRetryAt - Date.now()) / 1000}s 后再试(台账已落盘,重启也接着重试)`
    );
  }
  touch();
  return 'fail';
}

// ---------- 排空到期条目 ----------
async function pumpNow(opts) {
  const out = { attempted: 0, ok: 0, failed: 0, pending: 0, skipped: 0 };
  if (disabled()) return out;
  ensureLoaded();
  const limit = (opts && opts.burst) ? PARAMS.maxBurstInflight() : PARAMS.maxInflight();
  const room = Math.max(0, limit - inflight.size);
  if (!room) { out.pending = ledger.size; return out; }
  const now = Date.now();
  const due = [];
  for (const e of ledger.values()) {
    if (inflight.has(e.key)) continue;
    if ((e.nextRetryAt || 0) > now) continue;
    due.push(e);
  }
  due.sort((a, b) => (a.nextRetryAt - b.nextRetryAt) || (a.ts - b.ts));
  const take = due.slice(0, room);
  // 并发上限就是 room(参数语义"同时在途的对象数"):重启后台账几百条时,串行推会变成
  // "每轮 3 条 × 每条最多 45s(超时+2 次重试)"⇒ 一夜都推不完;放宽到并发才有实际消化能力。
  const sts = await Promise.all(take.map(e => attempt(e)));
  for (const st of sts) {
    out.attempted++;
    if (st === 'ok') out.ok++;
    else if (st === 'fail') out.failed++;
    else out.skipped++;
  }
  out.pending = ledger.size;
  return out;
}
// 不等待地顺手排空积压(syncPut 已自己试了当条,这条只是捎带别的到期旧账)
function pumpSoon() {
  return pumpNow({ burst: true }).catch(e => console.warn('[r2outbox] pump 异常:', e && e.message));
}

// ---------- 调用方用的两个"记一笔 + 马上试一次"(永不 reject、永不阻塞响应) ----------
// 返回 'ok' | 'fail' | 'pending'(同 key 已在途/在途期间又入账) | 'skipped'(未配置 CF/源文件没了)
async function syncPut(dir, name, srcPath) {
  const entry = enqueuePut(dir, name, srcPath);
  if (!entry) {
    // 台账被关了(R2_OUTBOX_DISABLE=1):关掉的是台账,不是同步本身 ⇒ 退回一次性直推
    return await directOnce(() => require('./r2sync').r2Put(dir, name, srcPath));
  }
  const mine = inflight.has(entry.key) ? Promise.resolve('pending') : attempt(entry);
  pumpSoon(); // 顺手把别的到期旧账也带走,不等下一个周期
  return await mine;
}
async function syncDelete(dir, name) {
  const entry = enqueueDelete(dir, name);
  if (!entry) return await directOnce(() => require('./r2sync').r2Delete(dir, name));
  const mine = inflight.has(entry.key) ? Promise.resolve('pending') : attempt(entry);
  pumpSoon();
  return await mine;
}
async function directOnce(fn) {
  try {
    const r = await fn();
    return r === true ? 'ok' : (r === null ? 'skipped' : 'fail');
  } catch (e) { return 'fail'; }
}

// ---------- 启停(定时器一律 unref;stopOutbox 幂等且清干净所有句柄) ----------
function startOutbox() {
  ensureLoaded();
  if (disabled()) {
    console.warn('[r2outbox] R2_OUTBOX_DISABLE=1 ⇒ 台账与周期补推关闭(单次同步照旧 fire-and-forget)');
    return false;
  }
  if (pumpTimer) return false; // 幂等:重复调用不再起第二套定时器
  stopped = false;
  started = true;
  pumpSoon(); // 启动即补推一次(异步,不拖慢 listen)
  pumpTimer = setInterval(() => { pumpNow().catch(e => console.warn('[r2outbox] 周期 pump 异常:', e && e.message)); }, PARAMS.pumpMs());
  if (pumpTimer && typeof pumpTimer.unref === 'function') pumpTimer.unref();
  const s = outboxStats();
  if (s.pending) console.log(`[r2outbox] 已启动:台账 ${s.pending} 条待补推(周期 ${PARAMS.pumpMs() / 1000}s,文件 ${outboxFile()})`);
  return true;
}
// 收尾:停表 + 落盘。返回是否真的停过(幂等)
function stopOutbox() {
  const was = !!pumpTimer || started;
  if (pumpTimer) { clearInterval(pumpTimer); pumpTimer = null; }
  started = false;
  stopped = true;
  flush();
  return was;
}
function flushStop() { return stopOutbox(); } // 别名:优雅关闭处读起来更直白

// ---------- 观测 ----------
function outboxStats(opts) {
  ensureLoaded();
  const now = Date.now();
  let put = 0, del = 0, oldestTs = 0, nextDue = 0, attempts1 = 0, attempts2 = 0, attemptsMid = 0, attemptsHigh = 0;
  const keys = [];
  for (const e of ledger.values()) {
    if (e.op === 'delete') del++; else put++;
    if (!oldestTs || e.ts < oldestTs) oldestTs = e.ts;
    const d = e.nextRetryAt || 0;
    if (!nextDue || d < nextDue) nextDue = d;
    if (e.attempts <= 1) attempts1++;
    else if (e.attempts === 2) attempts2++;
    else if (e.attempts <= 5) attemptsMid++;
    else attemptsHigh++;
    keys.push(e.key);
  }
  let transport = null;
  try {
    const m = require('./r2sync');
    if (typeof m.r2Stats === 'function') transport = m.r2Stats();
  } catch (e) {}
  const s = {
    file: outboxFile(),
    disabled: disabled(),
    started,
    pending: ledger.size,
    put, delete: del,
    inflight: Array.from(inflight),
    oldestAgeMs: oldestTs ? now - oldestTs : 0,
    nextDueInMs: nextDue ? Math.max(0, nextDue - now) : null,
    attempts: { '1': attempts1, '2': attempts2, '3-5': attemptsMid, '6+': attemptsHigh },
    totals: Object.assign({}, totals, { dirty, pendingWriteInMs: flushTimer ? PARAMS.flushMs() : 0 }),
    params: paramsSnapshot(),
    transport,
    keys: keys.slice(0, (opts && opts.keys) ? Math.min(200, keys.length) : 20),
  };
  return s;
}
function pendingKeys() { ensureLoaded(); return Array.from(ledger.keys()); }
function has(keyOrDir, name) {
  ensureLoaded();
  const k = name === undefined ? String(keyOrDir) : keyOf(keyOrDir, name);
  return ledger.has(k);
}
function entryOf(dir, name) { ensureLoaded(); return ledger.get(keyOf(dir, name)) || null; }

// 仅测试/运维用:清内存台账与计数(默认顺带清盘上的台账文件),并强制下次重新读盘
function _reset(opts) {
  const o = opts || {};
  if (pumpTimer) { clearInterval(pumpTimer); pumpTimer = null; }
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  ledger.clear(); inflight.clear(); dirty = 0; loaded = false; started = false; stopped = false;
  totals.succeeded = 0; totals.failed = 0; totals.dropped = 0; totals.evicted = 0; totals.writes = 0; totals.lastFlushAt = 0;
  cfSkipWarned = false;
  if (o.unlink !== false) {
    try { fs.unlinkSync(outboxFile()); } catch (e) {}
    try { fs.unlinkSync(outboxFile() + '.tmp'); } catch (e) {}
    fileExists = false;
  }
  return true;
}

module.exports = {
  // 入账(只记账,等 pump)
  enqueuePut, enqueueDelete,
  // 记账 + 立即试一次(调用方就这两个,fire-and-forget 语义保持:永不 reject、永不阻塞响应)
  syncPut, syncDelete,
  // 重试循环
  pump: pumpNow, pumpNow, startOutbox, stopOutbox, flushStop, flush, stop: stopOutbox,
  // 观测
  outboxStats, pendingKeys, has, entryOf, paramsSnapshot, backoffMs, keyOf, outboxFile,
  // 常量/测试钩子
  LEDGER_VER, DEFAULT_FILE_NAME, PARAMS, _reset,
};
