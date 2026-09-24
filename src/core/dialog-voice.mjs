// dialog-voice.mjs — 剧情台词朗读(2026-09-24,主人指令"用小米语音接口朗读台词")
// 桥接:对话框(gameshell-dialog) ↔ /api/tts(lib/tts.js:MiMo TTS 首选 → edge-tts 兜底,
//       文案哈希缓存 —— 同一句台词永不重复合成;2026-09-24 起 AI 调用不再设日限配额)。
//
// 设计定夺:
//   ① **只读含汉字的行**:闸门默认英文(scriptLang=en),英文行不读 —— zh 声线读英文
//      效果差且白烧配额;切中文后自动开口,零配置。
//   ② **替换语义不排队**:台词朗读自己持有一个 Audio,新行顶掉旧行 —— 对话链推进快于
//      音频时长时,排队会让声音越落越远(与 hint 通道的队列语义刻意不同)。
//   ③ **每会话可静音**:对话框角落 🔈 按钮,sessionStorage 记忆(会话级,不进 store 存档)。
//   ④ 说话人分声线(spk 来自 story-text who 常量):王子=小艺,飞行员=云希,其余=晓晓。
//      MiMo 不认 edge-tts 声线名时其内部兜底,再不行回落 edge-tts —— 双引擎都在服务端。
//   ⑤ **下一行预取**(2026-09-24 流畅度):当前行朗读时把下一行语音预热进缓存,
//      推进到下一行时即刻开口,不再有 1-3s 合成空窗(prefetchLine)。
const SPK_VOICES = {
  prince: 'zh-CN-XiaoyiNeural',
  pilot: 'zh-CN-YunxiNeural',
  sheep: 'zh-CN-XiaoxiaoNeural',
  rose: 'zh-CN-XiaoxiaoNeural',
};
const OFF_KEY = 'dialogVoiceOff';
const MAX_SPEAK_LEN = 220; // 与 lib/tts.js MAX_LEN 对齐,超长服务端还会再截

/** 说话人 → 声线(未知说话人走默认晓晓) */
export function voiceFor(spk) {
  return SPK_VOICES[spk] || 'zh-CN-XiaoxiaoNeural';
}

/** 是否含汉字(朗读门槛:纯英文/数字行不读) */
export function hasCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(String(text || ''));
}

/**
 * 朗读决策(纯函数,单测钉死):静音关 / 无汉字 / 空文案 → 不读
 * @returns {{speak: boolean, reason: string}}
 */
export function speakDecision(text, voiceOff) {
  if (voiceOff) return { speak: false, reason: 'muted' };
  if (!text || !String(text).trim()) return { speak: false, reason: 'empty' };
  if (!hasCJK(text)) return { speak: false, reason: 'no-cjk' };
  return { speak: true, reason: 'ok' };
}

let cur = null; // 当前台词朗读(替换语义:新行顶旧行)
const warmed = new Set(); // 本会话已预取过的台词 URL(防重复 load)

export function stopSpeaking() {
  if (cur) {
    try {
      cur.pause();
    } catch (e) {}
    cur = null;
  }
}

/** 朗读一行台词;返回决策(诊断/探针用) */
export function speakLine(text, spk) {
  const d = speakDecision(text, isVoiceOff());
  if (!d.speak) return d;
  stopSpeaking();
  try {
    cur = new Audio(ttsUrl(text, voiceFor(spk)));
    cur.play().catch(() => {}); // 手势限制/缓存未就绪静默(与 kunlunSpeak 同策略)
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
  if (!d.speak) return d;
  const url = ttsUrl(text, voiceFor(spk));
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
    return sessionStorage.getItem(OFF_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function toggleVoiceOff() {
  const next = !isVoiceOff();
  try {
    if (next) sessionStorage.setItem(OFF_KEY, '1');
    else sessionStorage.removeItem(OFF_KEY);
  } catch (e) {}
  if (next) stopSpeaking();
  return next;
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
