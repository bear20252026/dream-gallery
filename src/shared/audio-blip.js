// shared/audio-blip.js — WebAudio 叮/钟提示音统一实现(2026-08-30 B1 架构整改)
// 收敛原 6 份逐行近似的振荡器代码(ark/eternal/spirits/finale/windchime 各自手写)。
// 每个 API 内置 try/catch:音频失败绝不影响游戏逻辑。
// AudioContext 为共享惰性单例(原先各函数 .ac 属性各自持有,合并后统一)。

let _ac = null;
function ac() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  return _ac;
}

/**
 * 单振荡器正弦音(底层原语,其余 API 均由它组合)
 * @param {object} o
 * @param {number} o.freq   频率 Hz
 * @param {number} o.gain   增益峰值(0~1)
 * @param {number} [o.delay=0]      起始延迟 s
 * @param {number} [o.decay=1.4]    指数衰减时长 s
 * @param {AudioNode} [o.dest]      输出节点(默认 destination,空间音频时传 PannerNode)
 * @param {AudioContext} [o.audioCtx] 音频上下文(空间音频节点属于独立 context 时必传)
 */
export function tone({ freq, gain, delay = 0, decay = 1.4, dest, audioCtx }) {
  try {
    const a = audioCtx || ac();
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g);
    g.connect(dest || a.destination);
    o.start(t0);
    o.stop(t0 + decay + 0.1);
  } catch (e) {}
}

/**
 * `chime` 的选项包。键表由两处共同裁决(2026-10-15 第六刀):实现真正读的就是这五个,
 * 而三处调用传的是「不传包」(ark.js:411)/`{peak,decay,delay2}`(eternal.js:635)/
 * `{peak,decay}`(spirits.js:277)。`dest`/`audioCtx` 今天没有 chime 的调用方用,但本函数
 * 确实把它们转发给 tone,所以留成可选而不是删掉。判据见 types-param-bag-shapes.test.js。
 * @typedef {{peak?:number, decay?:number, delay2?:number, dest?:AudioNode|null, audioCtx?:AudioContext|null}} ChimeOpts
 */

/**
 * 双音叮:基音 + 高八度(delay2 后到达)。ark/spirits/eternal 的 chime 皆此形。
 * @param {number} base 基音频率 Hz
 * @param {ChimeOpts} [o] peak=0.2 增益峰值, decay=1.4 衰减, delay2=0.12 高八度延迟, dest/audioCtx=空间音频旁路
 */
export function chime(base, o = {}) {
  const decay = o.decay || 1.4;
  tone({ freq: base, gain: o.peak || 0.2, decay, dest: o.dest, audioCtx: o.audioCtx });
  tone({
    freq: base * 2,
    gain: o.peak || 0.2,
    delay: o.delay2 !== undefined ? o.delay2 : 0.12,
    decay,
    dest: o.dest,
    audioCtx: o.audioCtx,
  });
}

/**
 * 钟:基音 + 纯五度同时发声(五度增益减半)。finale.js 的 bell 皆此形。
 * @param {number} f    基音频率
 * @param {number} g    基音增益
 * @param {number} dur  衰减时长 s
 * @param {AudioNode} [dest]     空间音频输出节点(finale/peaks 之外的空间化调用方用;多数站点只传前 3 个)
 * @param {AudioContext} [audioCtx] 上述节点所属 context
 */
export function bell(f, g, dur, dest, audioCtx) {
  tone({ freq: f, gain: g, decay: dur, dest, audioCtx });
  tone({ freq: f * 1.5, gain: g * 0.5, decay: dur, dest, audioCtx });
}

/**
 * 风铃:三泛音(523.25/1046.5/1569.8)同时发声,2.5s 长衰减。windchime.js 专用。
 * @param {number} [delay=0] 起始延迟 s
 * @param {AudioNode} [dest]   空间音频输出节点
 * @param {AudioContext} [audioCtx] 空间音频所属 context
 */
export function windChime(delay, dest, audioCtx) {
  [523.25, 1046.5, 1569.8].forEach((f, k) =>
    tone({ freq: f, gain: [0.2, 0.09, 0.045][k], delay: delay || 0, decay: 2.5, dest, audioCtx })
  );
}

/**
 * 木窗"咯"声:三角波 160→90Hz 下滑短音。snowwin.js 专用(B-a 整改收敛)。
 * @param {number} [dur=0.16] 衰减时长 s
 */
export function creak(dur = 0.16) {
  try {
    const a = ac();
    const t0 = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(90, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
