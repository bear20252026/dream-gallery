// dialog-prewarm.js — 剧情台词预合成流水线(2026-09-26,主人令「最好的方案」·调研定案)
// 调研结论(联网:AAA 游戏语音 + 语音 Agent 两个领域交叉):静态台词走「预合成+缓存」,
// 动态内容才走流式 —— 我们的剧情台词 100% 静态(单一源 shared/story-text.mjs,双语各 ~114 条),
// 缓存命中率可做到 100%,首句延迟从 3.4~5.4s 降到 ~50ms(缓存命中即回)。
// 机制:①递归收集 story-text.mjs 全部 {en,zh} 台词;②按当前语言优先的顺序,分小批
// POST /api/tts/batch(服务端低优先级队列,实时台词永远优先,慢慢煮不抢带宽);
// ③配合 dialog-voice 的逐行预取,形成三层预热(见 gameshell-dialog)。
// 全程 fire-and-forget:任何失败静默,不影响页面(与全站错误静默铁律一致)。
import * as ST from '../shared/story-text.mjs';
import { voiceFor, warmBlobByKey } from './dialog-voice.mjs';
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

// ============ 最后一米:内存/blob 双预热(2026-09-26 终验定案) ============
// 终验实锤:Audio load 预热在拥塞下不可靠(浏览器节流/HTTP 缓存逐出),播放期仍 15.9s 开播;
// 台词小包还与模型大资产共用 cdn 连接池被 h2 挤兑。解法:batch 响应带回「已煮键」→
// fetch(CORS 全放行)拉成 blob 内存常驻 —— 播放期零网络零缓存博弈,永远秒开。
// 失败静默:没驻留成功的键,播放期自然走流式路径(与旧行为一致),绝不影响页面。
const R2_BASE = 'https://cdn.cloudbear.cloud'; // 与 dialog-voice 同源(2026-09-26 音频走 R2 镜像)
function warmEdge(keys) {
  for (const k of keys || []) {
    try {
      warmBlobByKey(k).catch(() => {});
    } catch (e) {
      /* 无 fetch 环境静默 */
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
      if (i >= ordered.length) {
        // 补煮一轮(2026-09-26 主人报「部分对话朗读不了」):首轮灌队时若服务端队列已满,
        // 尾部条目会被静默丢弃;10min 后(服务端 ~9min 煮完首轮)重灌一遍 —— 已煮的直接
        // 命中(响应带 keys → 预热边缘),漏煮的重新入队。一次会话内把全库煮满。
        setTimeout(
          () => {
            let j = 0;
            (function repost() {
              if (j >= ordered.length) return;
              const batch = ordered.slice(j, j + BATCH_SIZE);
              j += BATCH_SIZE;
              postBatch(batch).then((r) => {
                if (r && Array.isArray(r.keys)) warmEdge(r.keys);
              });
              setTimeout(repost, BATCH_GAP_MS);
            })();
          },
          10 * 60 * 1000
        );
        return;
      }
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
