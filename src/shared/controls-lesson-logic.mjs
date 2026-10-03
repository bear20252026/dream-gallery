// controls-lesson-logic.mjs — 首次操作小课的纯逻辑(2026-10-03 测试反馈「第一次来的人不知道怎么操作」)
// 三步:走动 → 转视角 → 跟着指引。只看玩家真的做了没有(移动距离/转头角度),
// 不靠计时自动跳过;最后一步由玩家点「知道了」收尾。零依赖,单测钉死。

export const LESSON_STEPS = ['walk', 'look', 'follow'];
export const WALK_METERS = 2; // 离开起点 2m 才算会走
export const LOOK_RADIANS = 0.6; // 累计转头约 35° 才算会看

/** 文案:keyboard / touch 两套,中英双语;tt() 在调用方做 */
export const LESSON_TEXT = {
  title: { zh: '怎么走动', en: 'How to move' },
  skip: { zh: '跳过', en: 'Skip' },
  done: { zh: '知道了', en: 'Got it' },
  help: { zh: '操作说明', en: 'Controls' },
  short: {
    walk: { zh: '走动', en: 'Walk' },
    look: { zh: '看看', en: 'Look' },
    follow: { zh: '跟指引', en: 'Follow' },
  },
  keyboard: {
    walk: { zh: '按 W A S D 或方向键走路', en: 'Walk with W A S D or the arrow keys' },
    look: { zh: '按住鼠标拖动,转头看看四周', en: 'Hold the mouse and drag to look around' },
    follow: {
      zh: '左侧箭头指向下一个目标。嫌走路麻烦就点「自动走过去」。到了按 E 或点按钮。',
      en: 'The arrow on the left points to your goal. Click Walk there and you will walk by yourself. When you get there, press E or click the button.',
    },
  },
  touch: {
    walk: { zh: '推动左下角的圆形摇杆走路', en: 'Push the round stick at the bottom left to walk' },
    look: { zh: '在屏幕空白处滑动,转头看看四周', en: 'Swipe on an empty part of the screen to look around' },
    follow: {
      zh: '左侧箭头指向下一个目标。嫌走路麻烦就点「自动走过去」。到了点出现的按钮。',
      en: 'The arrow on the left points to your goal. Tap Walk there and you will walk by yourself. When you get there, tap the button that appears.',
    },
  },
};

/** 两个角度之差,规整到 [-π, π] */
export function angleDelta(a, b) {
  let d = (b || 0) - (a || 0);
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/**
 * 推进一步。state={step, origin:{x,z}|null, turned}, sample={x,z,yaw,prevYaw}
 * 返回新 state(不改原对象)。step 到 2(follow)后只能由玩家点按钮结束。
 */
export function advanceLesson(state, sample) {
  const s = { step: state.step || 0, origin: state.origin || null, turned: state.turned || 0 };
  if (!sample) return s;
  if (s.step === 0) {
    if (!s.origin) s.origin = { x: sample.x, z: sample.z };
    else if (Math.hypot(sample.x - s.origin.x, sample.z - s.origin.z) >= WALK_METERS) s.step = 1;
  } else if (s.step === 1) {
    if (typeof sample.prevYaw === 'number') s.turned += Math.abs(angleDelta(sample.prevYaw, sample.yaw));
    if (s.turned >= LOOK_RADIANS) s.step = 2;
  }
  return s;
}

/**
 * 何时开课:画完羊(第一次需要自己走路)之后,且此刻没有对白/弹层/画板,
 * 还没上过课。world 不限(老玩家首次进 B612 也能补上)。
 */
export function shouldStartLesson({ done, scene2, dialog, overlay, board, hasPlayer }) {
  return !done && !!scene2 && !dialog && !overlay && !board && !!hasPlayer;
}
