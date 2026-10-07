// ratelimit.js — 公开 AI 接口的每分钟限流(2026-10-07 审查#2)
// 背景:2026-09-24 主人令拆除的是「按设备日配额」——正常访客根本用不到那个量级;
// 这里补的是另一个维度的「洪水防护」:按 realIP 每分钟滑动计数,只打滥用,正常游玩永远碰不到。
// 阈值(每 IP 每分钟):tts-synth 20(缓存命中不占额) / tts-batch 60(客户端预热 53s 发 44 批,不能误伤) /
//   quiz-ai 6(命中=静默回退本地阅卷,访客无感) / chat-bot 6(命中=跳过本次召唤,发言照常)。
// 身份:lib/store.js realIP(req) —— 仅当直连地址是可信反向代理时才采 CF-Connecting-IP,
//   直连伪造头无效(回退 socket 地址);运维侧配合安全组只放行 CF IP 段则完全不可伪造。
const { realIP } = require('./store');

const windows = new Map(); // 'bucket|ip' -> { n, start }
const MAX_KEYS = 5000;     // 防伪造 IP 撑爆内存(超出按窗口起点淘汰最旧)

function hit(req, bucket, limit, windowMs) {
  const ms = windowMs || 60000;
  const ip = realIP(req) || 'unknown';
  const key = bucket + '|' + ip;
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start >= ms) {
    w = { n: 0, start: now };
    windows.set(key, w);
    if (windows.size > MAX_KEYS) {
      const oldest = [...windows.entries()].sort((a, b) => a[1].start - b[1].start).slice(0, 1000);
      for (const [k] of oldest) windows.delete(k);
    }
  }
  w.n += 1;
  return { ok: w.n <= limit, retryAfter: Math.max(1, Math.ceil((w.start + ms - now) / 1000)) };
}

function _reset() {
  windows.clear();
}

module.exports = { hit, _reset };
