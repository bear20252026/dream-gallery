// chat-words.mjs — 召唤机器人的"触发词"单一源(2026-10-17)
//
// 起因(外部审计 C9,回读代码证实):聊天室界面写着「@B612之灵 可召唤它回答」(src/gate/settings/chat-room.js:17),
// 而后端只认 `@(昆仑之灵|机器人|bot)`(lib/chat.js:66)⇒ **照屏幕上教的打字,机器人不回**,
// 而前端还会 `setTimeout(loadChat,6000)` 刷一次去等那条永远不来的回帖。
// 这与温柔度面板那族"界面有按钮、实现没人接"是同一个病:**两边各写一份正则,就没有人保证它们相等。**
//
// 规矩:新增/调整召唤词只改这里。旧词 `昆仑之灵` 刻意保留(2026-09-06 重题令之前的老访客习惯,
// 以及后台/探针可能仍在用它),摘它属于破坏既有输入,不在这一刀里。
// 判词不许写回两个消费点 —— 由 src/__tests__/lib-chat-trigger.test.js 双向钉住。

/** 机器人显示名(回帖的 `n` 字段)。
 *  ⚠️**改名不归工程侧**:界面写的是「@B612之灵」而回帖署名仍是「昆仑之灵」(2026-09-06 重题令 cfe50a9
 *  清了 src/ 与 admin.html,没列 lib/)。要不要统一成 B612 口径属于文案决定(M-09 同一条),这里只是
 *  把它从散落的字面量收成一处,让那变成**改一行**的事,而不是顺手改掉。 */
export const BOT_NAME = '昆仑之灵';

/** 会触发召唤的词(大小写不敏感)。UI 提示、后端判定、剥词三处共用。 */
export const BOT_TRIGGERS = Object.freeze(['B612之灵', '昆仑之灵', '机器人', 'bot']);

/** 供正则使用的转义 alternation。 */
export function triggerAlt() {
  return BOT_TRIGGERS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

/** 判定一条发言是否要召唤机器人。每次新建实例:正则带 /g 时 .test 会被 lastIndex 带偏。 */
export function triggerRe() {
  return new RegExp('@(' + triggerAlt() + ')', 'i');
}

/** 把触发词从送交给 AI 的正文里剥掉(全部,不止第一个)。 */
export function stripTriggers(text) {
  return String(text || '')
    .replace(new RegExp('@(' + triggerAlt() + ')', 'gi'), '')
    .trim();
}

/** 召唤的洪水防护口径(单一源:桶名 + 每 IP 每分钟次数),后台手册与测试都读这里。 */
export const BOT_RATE_BUCKET = 'chat-bot';
export const BOT_RATE_PER_MIN = 6;
