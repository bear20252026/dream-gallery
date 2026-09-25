// dialog-prewarm.js — 剧情台词预合成流水线(2026-09-26,主人令「最好的方案」·调研定案)
// 调研结论(联网:AAA 游戏语音 + 语音 Agent 两个领域交叉):静态台词走「预合成+缓存」,
// 动态内容才走流式 —— 我们的剧情台词 100% 静态(单一源 shared/story-text.mjs,双语各 ~114 条),
// 缓存命中率可做到 100%,首句延迟从 3.4~5.4s 降到 ~50ms(缓存命中即回)。
// 机制:①递归收集 story-text.mjs 全部 {en,zh} 台词;②按当前语言优先的顺序,分小批
// POST /api/tts/batch(服务端低优先级队列,实时台词永远优先,慢慢煮不抢带宽);
// ③配合 dialog-voice 的逐行预取,形成三层预热(见 gameshell-dialog)。
// 全程 fire-and-forget:任何失败静默,不影响页面(与全站错误静默铁律一致)。
import * as ST from '../shared/story-text.mjs';
import { voiceFor } from './dialog-voice.mjs';
import { avAllowed } from './av-switch.js';

const BATCH_SIZE = 20; // 每批条数(≤服务端 MAX_BATCH_ITEMS 60;batch 让位,连续灌不抢实时)
const BATCH_GAP_MS = 1200; // 批间隔:服务端低优先级队列保证实时台词优先,这里尽量快煮
let started = false;

// 递归收集 {en,zh} 台词条目;沿途继承容器上的 who.spk(说话人)——
// 2026-09-26 真实取证:缓存键含音色,煮错音色=白煮(王子行被煮成默认女声,
// 实际播放用 Milo → 缓存永不命中)。STORY/SCENE2-5 每条自带 who.spk,务必带上。
function collectEntries(node, out, spk) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.en === 'string' || typeof node.zh === 'string') {
    out.push({ entry: node, spk: (node.who && node.who.spk) || spk || '' });
    return out;
  }
  const own = (node.who && node.who.spk) || spk || '';
  for (const k of Object.keys(node)) {
    if (k === 'who') continue; // who 是说话人元数据,不是台词
    collectEntries(node[k], out, own);
  }
  return out;
}

function allLines() {
  const entries = [];
  for (const k of Object.keys(ST)) {
    const v = ST[k];
    if (typeof v === 'function') continue;
    collectEntries(v, entries, '');
  }
  return entries;
}

function postBatch(items) {
  try {
    return fetch('/api/tts/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}

// ============ 最后一米:边缘/浏览器双预热(2026-09-26 单行诊断定案) ============
// 单行诊断(tts-single-line-probe)实锤:台词 .mp3 在 CF 边缘的**首次拉取**要付一次
// 跨境回源填充(拥塞时 16KB 爬 17s),正好撞上播放窗口 = 该行无声;填充后 Range 请求
// 也 HIT(~2s)、浏览器 HTTP 缓存内 ~20ms。解法:batch 响应带回「已煮键」,
// 客户端立刻在后台 load 这些 .mp3 —— 闸门/电影的死时间里把边缘填满 + 浏览器缓存焐热,
// 剧情开播时每行 <100ms 就绪。静默失败,绝不影响页面。
const edgeWarmed = new Set();
function warmEdge(keys) {
  for (const k of keys || []) {
    if (edgeWarmed.has(k)) continue;
    edgeWarmed.add(k);
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.src = '/tts-audio/' + k + '.mp3';
      a.load();
    } catch (e) {
      /* 无 Audio 环境静默 */
    }
  }
}

// 入口:闸门出现后调用(玩家读协议/看开场电影的死时间,后台慢慢煮缓存)
export function prewarmDialogs() {
  if (started) return;
  started = true;
  if (!avAllowed('dialogue')) return; // 对白豁免通道恒真;防御性判断
  try {
    const entries = allLines();
    if (!entries.length) return;
    // 顺序:当前语言优先,另一语言殿后(玩家马上要听的是当前语言)
    const lang = ST.scriptLang();
    const ordered = [];
    for (const e of entries) {
      const t = e.entry[lang] || e.entry.en || e.entry.zh;
      if (t) ordered.push({ text: t, voice: voiceFor(e.spk, t) });
    }
    const other = lang === 'zh' ? 'en' : 'zh';
    for (const e of entries) {
      const t = e.entry[other] || e.entry.en || e.entry.zh;
      if (t) ordered.push({ text: t, voice: voiceFor(e.spk, t) });
    }
    // 分批发送:批间 1.2s,总 ~23 批;服务端煮缓存的同批响应带回已煮键 → 立刻预热边缘
    let i = 0;
    (function next() {
      if (i >= ordered.length) return;
      const batch = ordered.slice(i, i + BATCH_SIZE);
      i += BATCH_SIZE;
      postBatch(batch).then((r) => {
        if (r && Array.isArray(r.keys)) warmEdge(r.keys);
      });
      setTimeout(next, BATCH_GAP_MS);
    })();
  } catch (e) {
    /* 静默:预合成失败只影响延迟,不影响功能 */
  }
}
