// audio-guard.js — WebAudio 时间参数全局守卫(2026-09-05)
// 根治:某些音频上下文在关闭/挂起时 currentTime 变成 NaN,导致 AudioParam
// 的 linearRamp/setTargetAtTime/exponentialRamp 抛 TypeError(全网反复刷屏)。
// 这里直接包装 AudioParam 原型的时间型方法:收到非有限时间(或非正指数增益)时静默跳过,
// 覆盖全站所有调用点(音乐画布/音效/开场电影等),免去逐处 isFinite。
(() => {
  try {
    const p = window.AudioParam && window.AudioParam.prototype;
    if (!p) return;
    const fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const wrap = (m) => {
      const orig = p[m];
      if (!orig) return;
      p[m] = function (value, time, a) {
        if (!fin(time)) return; // 调度/结束时间非有限 → 跳过(静音,不报错)
        if (!fin(value)) return; // 增益/频率值非有限 → 跳过
        if (typeof a === 'number' && !fin(a)) return; // setTargetAtTime 的 timeConstant
        if (m === 'exponentialRampToValueAtTime' && !(value > 0)) return; // 指数必须>0
        return orig.apply(this, arguments);
      };
    };
    ['linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime'].forEach(wrap);
  } catch (e) {}
})();
