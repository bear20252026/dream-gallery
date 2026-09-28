// warm-planet-voices.mjs — 行星居民新声线预热(2026-09-28)
// 声线分层上线后 king/vain/tippler 的台词换了音色 → 缓存键全变(键含 voice)。
// 本脚本把这三个角色的全部台词(中英双版)POST /api/tts/batch 低优先级预合成;
// 合成成功 lib/tts.js 自动 r2Put 镜像 R2,玩家首播即命中。
// 用法:node scripts/dev/warm-planet-voices.mjs [BASE_URL](默认 http://localhost:3000)
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const { SCENE5, SCENE7_VANITY, SCENE7_TIPPLER, whoSpk } = await import('../../src/shared/story-text.mjs');
const { voiceFor } = await import('../../src/core/dialog-voice.mjs');

// 收集目标角色的句子(王子/羊/旁白音色未变,旧缓存仍命中,不重煮)
const TARGET = new Set(['king', 'vain', 'tippler']);
const items = [];
const push = (line) => {
  const spk = whoSpk(line.who || {});
  if (!TARGET.has(spk)) return;
  const voice = voiceFor(spk, line.en); // 英文轨音色
  const voiceZh = voiceFor(spk, line.zh); // 中文轨音色
  items.push({ text: line.en.slice(0, 220), voice });
  items.push({ text: line.zh.slice(0, 220), voice: voiceZh });
};
for (const t of [SCENE5, SCENE7_VANITY, SCENE7_TIPPLER]) {
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.en === 'string' && node.who) push(node);
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(t);
}
// SCENE7_TIPPLER.chain 是数组,who 在行对象上 —— walk 已覆盖;去重
const seen = new Set();
const uniq = items.filter((it) => {
  const k = it.voice + '|' + it.text;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
console.log('待预热 ' + uniq.length + ' 条(king/vain/tippler × 中英)');
if (!uniq.length) process.exit(0);
// batch 上限 60 条/次
for (let i = 0; i < uniq.length; i += 60) {
  const chunk = uniq.slice(i, i + 60);
  const r = await fetch(BASE + '/api/tts/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: chunk }),
  });
  console.log('batch[' + i / 60 + '] HTTP ' + r.status + ' (' + chunk.length + ' 条)');
}
console.log('已入队。服务端低优先级慢慢煮(2 工位,~4.5s/条),煮完自动镜像 R2。');
