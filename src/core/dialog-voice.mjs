// dialog-voice.mjs — 剧情台词朗读(2026-09-24,主人指令"用小米语音接口朗读台词")
// 桥接:对话框(gameshell-dialog) ↔ /api/tts(lib/tts.js:MiMo TTS 首选 → edge-tts 兜底,
//       文案哈希缓存 —— 同一句台词永不重复合成;2026-09-24 起 AI 调用不再设日限配额)。
//
// 设计定夺:
//   ① **中英文都读**(2026-09-26 修订:主人报「还是没有声音」→ 根因是闸门默认英文
//      (scriptLang=en),旧版「只读含汉字行」把英文台词全拦了 → 全程无声)。
//      音色按文本语言自动分轨(2026-09-26 对齐 MiMo 官方预置音色表):
//      中文:苏打(男,prince/pilot) / 茉莉(女,sheep/rose/其他)
//      英文:Milo(男,prince) / Dean(男,pilot) / Mia(女,sheep/rose/其他)
//   ② **替换语义不排队**:台词朗读自己持有一个 Audio,新行顶掉旧行 —— 对话链推进快于
//      音频时长时,排队会让声音越落越远(与 hint 通道的队列语义刻意不同)。
//   ③ **每会话可静音**:对话框角落 🔈 按钮,sessionStorage 记忆(会话级,不进 store 存档)。
//   ④ 说话人分声线(spk 来自 story-text who 常量);MiMo 预置音色官方文档
//      https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
//   ⑤ **下一行预取**(2026-09-24 流畅度):当前行朗读时把下一行语音预热进缓存,
//      推进到下一行时即刻开口,不再有 1-3s 合成空窗(prefetchLine)。
//   ⑥ 对白豁免总闸(2026-09-26):avAllowed('dialogue') 恒真,BGM/视频全静时对白照常。
const SPK_VOICES_ZH = {
  prince: '苏打',
  pilot: '苏打',
  sheep: '茉莉',
  rose: '茉莉',
};
const SPK_VOICES_EN = {
  prince: 'Milo',
  pilot: 'Dean',
  sheep: 'Mia',
  rose: 'Mia',
};
const OFF_KEY = 'dialogVoiceOff';
const MAX_SPEAK_LEN = 220; // 与 lib/tts.js MAX_LEN 对齐,超长服务端还会再截
import { avAllowed } from './av-switch.js'; // 全站音视频总闸(2026-09-26):总闸关闭等同静音

/** 说话人 → 声线(按文本语言分轨;未知说话人走默认女声) */
export function voiceFor(spk, text) {
  const zh = hasCJK(text);
  const table = zh ? SPK_VOICES_ZH : SPK_VOICES_EN;
  return table[spk] || (zh ? '茉莉' : 'Mia');
}

/** 是否含汉字(声线分轨依据;不再作为朗读门槛) */
export function hasCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(String(text || ''));
}

/**
 * 朗读决策(纯函数,单测钉死):静音关 / 空文案 → 不读
 * 2026-09-26 修订:去掉「无汉字不读」—— 闸门默认英文,旧逻辑致全程无声(主人亲报)。
 * @returns {{speak: boolean, reason: string}}
 */
export function speakDecision(text, voiceOff) {
  if (voiceOff) return { speak: false, reason: 'muted' };
  if (!text || !String(text).trim()) return { speak: false, reason: 'empty' };
  return { speak: true, reason: 'ok' };
}

let cur = null; // 当前台词朗读(替换语义:新行顶旧行)
const warmed = new Set(); // 本会话已预取过的台词 URL(防重复 load)

// ============ 播放追踪(2026-09-26 主人令:「播放过/播放错误/播放条数全部记录」) ============
// 本地缓冲,10s 批量上报 /api/tts/stats(失败静默丢弃,绝不影响播放)
const statBuf = [];
let statTimer = null;
function stat(ev, text, voice, extra) {
  try {
    statBuf.push(Object.assign({ ev, text: String(text || '').slice(0, 24), voice }, extra || {}));
    if (!statTimer) {
      statTimer = setTimeout(flushStats, 10000);
    }
  } catch (e) {}
}
function flushStats() {
  statTimer = null;
  if (!statBuf.length) return;
  const events = statBuf.splice(0, statBuf.length);
  try {
    fetch('/api/tts/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}


export function stopSpeaking() {
  if (cur) {
    try {
      // 掐断统计(2026-09-26):正在播的行被顶 = 主人只听到半句(直接量化「放太快」)
      if (!cur.paused && cur._statText) stat('cut', cur._statText, cur._statVoice);
      cur.pause();
    } catch (e) {}
    cur = null; // 置空:被顶掉的旧行其 AbortError 不再触发重试(重试仅限"未替换"场景)
  }
}

/** 朗读一行台词;返回决策(诊断/探针用) */
export function speakLine(text, spk) {
  const d = speakDecision(text, isVoiceOff());
  if (!d.speak) {
    if (d.reason === 'muted') stat('muted', text, ''); // 静音跳过也记录(主人要全量)
    return d;
  }
  if (!avAllowed('dialogue')) return d; // 对白豁免总闸(2026-09-26 主人令:先只让对话进行),仅受对话框🔇钮控制
  const voice = voiceFor(spk, text);
  stat('speak', text, voice); // 发起朗读(主人要的「播放条数」)
  stopSpeaking();
  try {
    const audio = new Audio(ttsUrl(text, voice));
    audio._statText = String(text || '').slice(0, 24);
    audio._statVoice = voice;
    cur = audio;
    // 2026-09-26 真实取证(探针 dialog-audio-truth):台词 play 频发 AbortError —— 行切换快于
    // 合成时长时,旧行被 stopSpeaking pause → play promise reject,旧版静默吞掉 → 主人全程无声。
    // 修复:①失败留痕(admin 错误追踪可见,不再是黑洞);②若 cur 未被替换(非正常换行)且是
    // AbortError,重试一次 —— 缓存命中后重试即秒开。
    const t0 = performance.now();
    audio.play().then(
      () => {
        stat('ok', text, voice, { ms: Math.round(performance.now() - t0) }); // 真实开播(「播放过」)
      },
      (e) => {
        stat('fail', text, voice, { err: (e && e.name) || 'unknown' });
        if (window.__reportError)
          window.__reportError('tts', '台词朗读播放失败: ' + ((e && e.name) || e), { source: 'dialog-voice' });
        if (e && e.name === 'AbortError' && cur === audio) {
          setTimeout(() => {
            if (cur === audio) audio.play().catch(() => {});
          }, 120);
        }
      }
    );
  } catch (e) {
    cur = null;
  }
  return d;
}

/** 组 TTS 请求 URL(speakLine 与 prefetchLine 共用,保音色/截断一致) */
function ttsUrl(text, voice) {
  return (
    '/api/tts?text=' +
    encodeURIComponent(String(text).slice(0, MAX_SPEAK_LEN)) +
    '&voice=' +
    encodeURIComponent(voice)
  );
}

/**
 * 预取下一行台词(2026-09-24 流畅度):静默 load 进浏览器缓存(服务端亦有文案哈希缓存),
 * 推进到该行时 speakLine 的 Audio 直接吃 HTTP 缓存,零合成空窗。
 * 复用 speakDecision:静音/无汉字/空行不预取,浪费带宽为零。
 */
export function prefetchLine(text, spk) {
  const d = speakDecision(text, isVoiceOff());
  if (!d.speak || !avAllowed('dialogue')) return d; // 对白豁免总闸:预取照常(推进到该行零空窗)
  const url = ttsUrl(text, voiceFor(spk, text));
  if (warmed.has(url)) return d;
  warmed.add(url);
  try {
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
    a.load();
  } catch (e) { /* 无 Audio 环境(测试/异常)静默 */ }
  return d;
}

export function isVoiceOff() {
  try {
    const v = sessionStorage.getItem(OFF_KEY);
    if (!v) return false;
    // 24h 自动过期(2026-09-26):静音钮太容易被误点,误点后最多哑一天,不再哑到关标签
    const ts = parseInt(v, 10);
    if (Number.isFinite(ts)) {
      if (Date.now() - ts > 24 * 3600 * 1000) {
        sessionStorage.removeItem(OFF_KEY);
        return false;
      }
      return true;
    }
    return v === '1'; // 旧格式(裸 '1')照旧兼容
  } catch (e) {
    return false;
  }
}

export function toggleVoiceOff() {
  const next = !isVoiceOff();
  try {
    if (next) sessionStorage.setItem(OFF_KEY, String(Date.now())); // 存时间戳供 24h 过期
    else sessionStorage.removeItem(OFF_KEY);
  } catch (e) {}
  if (next) stopSpeaking();
  return next;
}

/** 是否有台词语音正在播(供对白 autoHide 联动:语音播完再开始倒计时关闭) */
export function isVoicePlaying() {
  try {
    return !!(cur && !cur.paused);
  } catch (e) {
    return false;
  }
}

/** 台词语音结束回调(一次性);never 情形(无语音在播)立即执行 */
export function onVoiceEnd(cb) {
  if (!cur) {
    cb();
    return;
  }
  const fin = () => {
    try {
      cb();
    } catch (e) {}
  };
  cur.addEventListener('ended', fin, { once: true });
  cur.addEventListener('error', fin, { once: true });
  // 兜底:语音链路任何意外卡住,15s 后强制放行(对白关闭不能被语音无限拖延)
  setTimeout(fin, 15000);
}

/** 对话框挂静音钮(gameshell-dialog attach 时调用;防重复安装) */
export function installMuteBtn(dialogEl) {
  if (!dialogEl || dialogEl.querySelector('.gs-voice')) return;
  const b = document.createElement('button');
  b.className = 'gs-voice';
  b.type = 'button';
  b.setAttribute('aria-label', '台词朗读开关');
  b.style.cssText =
    'position:absolute;right:10px;top:6px;border:none;background:none;cursor:pointer;' +
    'font-size:13px;opacity:.55;padding:2px 4px;line-height:1;font-family:inherit';
  const sync = () => {
    b.textContent = isVoiceOff() ? '🔇' : '🔈';
    b.title = isVoiceOff() ? '开启台词朗读' : '关闭台词朗读';
  };
  b.onclick = (e) => {
    e.stopPropagation(); // 别触发对话框推进
    toggleVoiceOff();
    sync();
  };
  sync();
  dialogEl.appendChild(b);
}
