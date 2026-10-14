// aiusage.js — AI 用量台账·单一源(2026-10-12 外部审计 P2:统一用量统计)
// 回答的只有一个问题:谁调了什么能力、命中了哪个通道、耗时多久、成没成、花了多少 token。
//
// ⚠️ 只观测,不决策:本模块不参与任何限流/配额判定。2026-09-24 主人明令拆除的「按设备日配额」
//   不在这里复活 —— 台账是观测面,现存防线(长度上限/缓存命中/chat 3 秒限流/vision 仅本人一次/
//   每 IP 每分钟洪水防护)一条都不改、一条不加。
// 🔒 隐私铁律:**绝不记录 prompt / 台词 / 照片名 / 任何文本内容** —— 只留
//   能力·通道·模型·耗时·成败·token·错误类别 七个维度,不新增任何文本留存面
//   (与 lib/tts-stats.js 存 text 前 24 字的做法刻意不同:那是播放器排障需要文本,这里不需要)。
// 💾 写放大:gateData 每次 saveGateData() 都是**整库序列化**(AGENTS 已记这是写放大主因,
//   lib/track.js 因此拿到"埋点专用豁免")。台账走同一口径:
//     · 内存里**同步累计** → 读数(后台统计端点)永远是最新的;
//     · **落盘节流** → 攒够 FLUSH_BATCH 条立刻落一次,否则 FLUSH_MS 窗口内的多次调用合并成一次。
//   定时器一律 unref():台账永不拖住进程退出;优雅关闭调 stop() 收尾。
// 📏 有界:recent 最多 RECENT_MAX 条、days 最多 DAYS_MAX 天(按天裁剪,照 capKeys 风格自己实现,
//   因为 capKeys 对"值为数字的表"按数值大小淘汰,用在按天键上会删错天)。
// 🔌 记账点(新增 AI 调用必须在这里登记一笔,否则"AI 接口=无上限成本攻击面"重新变回瞎的):
//   lib/vision.js analyzeImage   → 'vision'
//   lib/tts.js synth(实时/batch) → 'tts' / 'tts-batch'(缓存命中不出网,压根不经过 synth)
//   lib/quiz.js gradeQAWithAI    → 'quiz-ai'(被 ratelimit 挡下没出网的不记)
//   lib/chat.js callAI           → 'chat-bot'(@召唤被 ratelimit 挡下的不记)
//   还没接上的:lib/files-upload.js moderateImage(NSFW 审核,也走 chatVision)——该文件本轮禁改,挂账。
const store = require('./store'); // 命名空间引用:saveGateData 可被测试替换(同 lib/track.js 口径)

// 能力登记表:与消费方一一对应,新增能力只许在这里加(未知 capability 不入库,防埋点写错撑大台账)
const CAPS = { vision: 1, tts: 1, 'tts-batch': 1, 'quiz-ai': 1, 'chat-bot': 1 };
const CAP_LIST = Object.keys(CAPS);

const FLUSH_MS = 5000;     // 合并窗口:窗口内多次 record 只落一次盘
const FLUSH_BATCH = 20;    // 攒够这么多条不等窗口立刻落盘(台词预热一次几千条时的主路径)
const RECENT_MAX = 50;     // recent 明细上限
const DAYS_MAX = 14;       // days 保留天数上限
const BY_CHANNEL_MAX = 12; // 单日单能力的通道数护栏(通道名来自代码登记表,正常 ≤5)
const CH_MAX = 32;
const MODEL_MAX = 48;
const ERR_MAX = 24;

let dirty = 0;          // 已进内存但尚未落盘的条数
let saves = 0;          // 本进程台账落盘次数
let flushTimer = null;
let stopped = false;    // stop() 之后不再自行起定时器(优雅关闭)
const chanRoll = {};    // 通道 → { calls, ok, tokens } 进程内滚动(不落盘):看"哪个通道从不回 token"

function clip(s, n) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[\r\n]+/g, ' ').slice(0, n);
}
function num(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

// 台账容器:惰性建,形状固定 { days: {}, recent: [] }
function ledger() {
  const g = store.gateData;
  let l = g && g.aiUsage;
  if (!l || typeof l !== 'object') l = g.aiUsage = {};
  if (!l.days || typeof l.days !== 'object') l.days = {};
  if (!Array.isArray(l.recent)) l.recent = [];
  return l;
}

// 日界口径:与 stats.byDay(lib/store.js todayStr,服务器本地时间 UTC+8)逐字一致 ——
// 台账的「今天」必须和后台访问统计的「今天」是同一个格子,否则两页数字对不上。
// store.todayStr() 无参恒返今日,而 record 用的是调用时刻的时间戳,故这里自带同型实现。
function dayKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 按天裁剪:'YYYY-MM-DD' 字典序即时间序,超 14 天删最旧天(capKeys 风格的有界化,但按日期而非数值)
function trimDays(days) {
  const keys = Object.keys(days).sort();
  const excess = keys.length - DAYS_MAX;
  if (excess <= 0) return;
  for (const k of keys.slice(0, excess)) delete days[k];
}
// 插入顺序淘汰最旧(capKeys 的 else 分支语义;用于 byChannel 这种"值是计数"的表)
function trimInsertOrder(obj, max) {
  const keys = Object.keys(obj);
  const excess = keys.length - max;
  if (excess <= 0) return;
  for (const k of keys.slice(0, excess)) delete obj[k];
}

function schedule() {
  if (stopped || flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_MS);
  if (flushTimer && typeof flushTimer.unref === 'function') flushTimer.unref();
}

// 落盘(合并后的唯一写点):返回本次交给持久层的条数(0=没有在途数据)。
// ⚠️2026-10-14 第六轮审计 M-11/M-17:下面这段原先那句"写失败不清 dirty(台账不能静默丢账)"是**空的** ——
//   try/catch 包住的 `store.saveGateData()` 同步段只是设个时间戳再入队,磁盘错误发生在链的另一头、
//   还被链尾的 `.catch(console.error)` 吞掉,所以这个 catch 永远抓不到任何东西,dirty=0 / saves++ 照旧。
//   现在按 store 返回的**结果对象**判定:没落成就把这几条退回 dirty,由下一次 record/flush 再试。
function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!dirty) return 0;
  const n = dirty;
  dirty = 0;
  let p;
  let threw = false;
  try {
    p = store.saveGateData();
  } catch (e) {
    threw = true;
    console.warn('[aiusage] 台账落盘入队就抛错,已退回待写:', e && e.message);
  }
  if (threw) { dirty += n; return n; }
  if (p && typeof p.then === 'function') {
    p.then(
      (res) => {
        if (res && res.ok) { saves++; return; }
        dirty += n;
        console.warn(
          '[aiusage] 台账落盘未成功,已退回 ' + n + ' 条待写(下次 record/flush 再试):' +
            ((res && res.errors && res.errors.join(' | ')) || '拿不到结论')
        );
      },
      (e) => {
        dirty += n;
        console.warn('[aiusage] 台账落盘失败,已退回 ' + n + ' 条待写:', e && e.message);
      }
    );
  } else {
    saves++; // 同步实现/测试替身(没返回 Promise):当作已落盘
  }
  return n;
}

// 收尾:落盘 + 停表(优雅关闭用),返回结论 { ok, pending, error }。
// ⚠️2026-10-14 第六轮审计 M-11/M-17:这里改走 **saveGateDataSync()**。以前是 `flush(); stopped = true;`
//   而 flush 只是把写盘**入队** —— 关闭路径上入队等于赌"进程一直活着到链跑到",而 pm2 的 grace 到点就
//   SIGKILL,窗口里最后几条用量就这么没了;更糟的是链尾吞错(store 旧契约)让这件事连日志都不留。
//   同步写完再返回,调用方(server.js)按结论打日志。
// 停表后 record() 仍照常累计内存,只是不再自行起定时器 —— 台账活在 gateData 里,
// 任何别处的 saveGateData()(整库序列化)都会顺手把它带上盘,所以 stop 之后不会"永远丢在内存"。
function stop() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  stopped = true;
  const n = dirty;
  if (!n) return { ok: true, pending: 0, error: '' };
  let r = null;
  try {
    r = store.saveGateDataSync();
  } catch (e) {
    r = { ok: false, errors: [(e && e.message) || String(e)] };
  }
  if (r && r.ok) {
    dirty = 0;
    saves++;
    return { ok: true, pending: 0, error: '' };
  }
  // 没落成 ⇒ dirty 原样留着(下条 record 或下次 flush 还会带上,台账不静默丢)
  return { ok: false, pending: n, error: (r && r.errors && r.errors.join(' | ')) || '拿不到落盘结论' };
}

/**
 * 记一笔用量。info = { capability, channel, model, ok, latencyMs, tokens, errKind }
 *   capability — vision | tts | tts-batch | quiz-ai | chat-bot(其它值直接丢弃并返回 false)
 *   ok         — 必须显式传 true 才算成功(缺省按失败计,宁可高估失败)
 *   tokens     — provider 的 usage.total_tokens;取不到传 0(该通道不回 token)
 * 返回 true=已入账,false=未入账(未知能力)
 */
function record(info) {
  const it = info || {};
  const cap = CAPS[it.capability] ? it.capability : '';
  if (!cap) return false;
  const ok = it.ok === true;
  const now = Date.now();
  const ms = num(it.latencyMs, 0, 600000);
  const tokens = num(it.tokens, 0, 1000000000);
  const ch = clip(it.channel, CH_MAX) || 'unknown';
  const model = clip(it.model, MODEL_MAX);
  const err = ok ? '' : (clip(it.errKind, ERR_MAX) || 'fail');

  const l = ledger();
  const day = dayKey(now); // 与 stats.byDay 同一口径(本地日界)
  let byCap = l.days[day];
  if (!byCap || typeof byCap !== 'object') byCap = l.days[day] = {};
  let c = byCap[cap];
  if (!c || typeof c !== 'object') c = byCap[cap] = { calls: 0, ok: 0, fail: 0, ms: 0, tokens: 0, byChannel: {} };
  c.calls++;
  if (ok) c.ok++; else c.fail++;
  c.ms += ms;
  c.tokens += tokens;
  if (!c.byChannel || typeof c.byChannel !== 'object') c.byChannel = {};
  c.byChannel[ch] = (c.byChannel[ch] || 0) + 1;
  trimInsertOrder(c.byChannel, BY_CHANNEL_MAX);

  // recent:只留维度,不留内容(没有任何文本字段)
  const rec = { t: now, cap, ch, ok, ms, tok: tokens };
  if (model) rec.model = model;
  if (err) rec.err = err;
  l.recent.push(rec);
  while (l.recent.length > RECENT_MAX) l.recent.shift();
  trimDays(l.days);

  // 进程内通道滚动(观测"哪个通道不回 token";重启清零,不进台账)
  let r = chanRoll[ch];
  if (!r) r = chanRoll[ch] = { calls: 0, ok: 0, tokens: 0 };
  r.calls++;
  if (ok) r.ok++;
  r.tokens += tokens;

  dirty++;
  if (dirty >= FLUSH_BATCH) flush(); else schedule();
  return true;
}

// 只读汇总(后台统计端点用):按天×能力的汇总 + 最近调用 + 全窗口合计 + 通道滚动
function summary() {
  const l = ledger();
  const totals = { calls: 0, ok: 0, fail: 0, ms: 0, tokens: 0, byChannel: {} };
  const days = {};
  for (const dk of Object.keys(l.days).sort()) {
    const byCapOut = {};
    const byCap = l.days[dk] || {};
    for (const cap of Object.keys(byCap)) {
      const c = byCap[cap] || {};
      const calls = num(c.calls, 0, 1e9);
      const ok = num(c.ok, 0, 1e9);
      const row = {
        calls,
        ok,
        fail: num(c.fail, 0, 1e9),
        ms: num(c.ms, 0, 1e12),
        tokens: num(c.tokens, 0, 1e12),
        avgMs: calls ? Math.round(num(c.ms, 0, 1e12) / calls) : 0,
        rate: calls ? Math.round((ok / calls) * 100) : null, // 成功率 %(无调用为 null,前端显示 —)
        byChannel: Object.assign({}, c.byChannel),
      };
      byCapOut[cap] = row;
      totals.calls += calls;
      totals.ok += ok;
      totals.fail += row.fail;
      totals.ms += row.ms;
      totals.tokens += row.tokens;
      for (const [k, v] of Object.entries(row.byChannel)) totals.byChannel[k] = (totals.byChannel[k] || 0) + num(v, 0, 1e9);
    }
    days[dk] = byCapOut;
  }
  totals.avgMs = totals.calls ? Math.round(totals.ms / totals.calls) : 0;
  totals.rate = totals.calls ? Math.round((totals.ok / totals.calls) * 100) : null;
  return {
    now: Date.now(),
    caps: CAP_LIST,
    daysMax: DAYS_MAX,
    recentMax: RECENT_MAX,
    flushMs: FLUSH_MS,
    flushBatch: FLUSH_BATCH,
    pending: dirty,  // 还在窗口里没落盘的条数(节流正常形态,不是丢数据)
    saves,           // 本进程台账落盘次数
    totals,
    days,
    channels: Object.entries(chanRoll)
      .map(([ch, v]) => ({ ch, calls: v.calls, ok: v.ok, tokens: v.tokens, avgTok: v.calls ? Math.round(v.tokens / v.calls) : 0 }))
      .sort((a, b) => b.calls - a.calls), // tokens 恒 0 的通道 = 该通道不回 token
    recent: l.recent.slice(-RECENT_MAX).reverse(), // 最新在前
  };
}

module.exports = {
  record, flush, stop, summary, ledger,
  CAP_LIST, FLUSH_MS, FLUSH_BATCH, RECENT_MAX, DAYS_MAX,
  _reset() { // 仅测试用:清内存状态(台账本体在 gateData.aiUsage 里,由测试自己清)
    dirty = 0; saves = 0; stopped = false;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    for (const k of Object.keys(chanRoll)) delete chanRoll[k];
  },
};
