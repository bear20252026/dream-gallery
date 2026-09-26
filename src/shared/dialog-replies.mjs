// dialog-replies.mjs — 剧情对话「轮到玩家开口」互动链(2026-09-26 主人令「不仅仅是在放台词」)
// 用法:把 replyChoices(ctx,'wake',done) 挂到 openDialog 的 choices 上 —— 王子说完,
// 选项按钮出现;玩家点选 → 飞行员回应行朗读(pilot 声线) → 王子接话 → done(汇合主线)。
// 所有分支只做对话感,不产生持久分叉;文案单一源 story-text.mjs 的 REPLIES。
import { tt, whoSpk, REPLIES } from './story-text.mjs';

/**
 * @param ctx  场景上下文(用 ctx.openDialog)
 * @param key  REPLIES 节点:'wake' | 'drawn' | 'night'
 * @param done 王子接话播完后的回调(汇合原主线)
 * @returns choices 数组(直接传 openDialog 的 choices)
 */
export function replyChoices(ctx, key, done) {
  const node = REPLIES[key];
  if (!node || !node.choices) return null;
  return node.choices.map((c, i) => ({
    label: tt(c.label),
    value: i,
    onClick: (idx) => {
      const pick = node.choices[idx] || node.choices[0];
      // 玩家回应(飞行员,自动朗读)
      ctx.openDialog({
        speaker: tt(pick.pilot.who),
        speakerType: whoSpk(pick.pilot.who),
        lines: [tt(pick.pilot)],
        autoHide: 4200,
        lock: true,
        onDone: () => {
          // 王子接话
          ctx.openDialog({
            speaker: tt(pick.prince.who),
            speakerType: whoSpk(pick.prince.who),
            lines: [tt(pick.prince)],
            autoHide: 5200,
            lock: true,
            onDone: () => done && done(),
          });
        },
      });
    },
  }));
}
