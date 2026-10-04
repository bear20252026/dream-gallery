// story-music-logic.mjs — 按剧情章节选背景音乐(2026-10-03 主人提供五首曲目,由 Claude 编排)
// 编排思路(一段旅程一首歌,换场景才换曲,不在同一场景里来回切):
//   开场 · 坠机 · 画羊 · 羊箱之夜   → Turnaround(Hans Zimmer & Camille,《小王子》电影原声,轻快好奇)
//   B612 · 他的家(火山/面包树/日落/玫瑰)→ Our Corner of the Universe(K.S. Rhoads,「我们的小角落」)
//   拜访大人们的星球(国王/虚荣/酒鬼) → Equation(Hans Zimmer & Camille,大人世界的「算式」,安静不压台词)
//   回到沙漠自由走走 · 开飞机          → Salvation (HEYHEY Remix)(Gabrielle Aplin,有速度感)
//   地球之日(蛇/花/回声/玫瑰/狐狸)     → Turnaround(回到开头那首:他刚来地球,一切都新)
//   结局:告别 · 六年后                → Somewhere Only We Know(Keane)
//   找井那一段静音:那一段的玩法就是「靠听水声」找井,音乐会盖住线索。
// 零依赖纯函数,单测钉死;播放/淡入淡出/闪避在 ui/story-music.js。

export const CUES = {
  turnaround: { file: 'turnaround.mp3', volume: 0.42, en: 'Turnaround', by: 'Hans Zimmer & Camille' },
  corner: { file: 'our-corner.mp3', volume: 0.42, en: 'Our Corner of the Universe', by: 'K.S. Rhoads' },
  equation: { file: 'equation.mp3', volume: 0.38, en: 'Equation', by: 'Hans Zimmer & Camille' },
  salvation: { file: 'salvation.mp3', volume: 0.34, en: 'Salvation (Remix)', by: 'Gabrielle Aplin & HEYHEY' },
  somewhere: { file: 'somewhere-only-we-know.mp3', volume: 0.4, en: 'Somewhere Only We Know', by: 'Keane' },
};

// 结局进度(与 shared/ending-logic.mjs ENDING 同值;这里只用到三档,避免引入依赖)
const BOOK_READ = 1; // 画册页读完 → 去找井(静音)
const WELL_FOUND = 2;

/**
 * @param {{world?:string, scene2?:boolean, page1?:boolean, chapter?:number,
 *          endingReady?:boolean, endingStep?:number, earthDay?:boolean, flying?:boolean, epilogue?:boolean, opening?:boolean}} s
 * @returns {string|null} CUES 的键;null = 此刻不放音乐
 */
export function pickCue(s) {
  const f = s || {};
  const world = f.world || 'main';
  if (f.opening) return 'turnaround'; // 闸门与开场电影:每次进来都从电影原声开始
  if (f.epilogue) return 'somewhere';
  if (f.flying) return 'salvation';
  if (world === 'b612') return 'corner';
  if (/^king\d+$/.test(world)) return 'equation';
  // 沙漠(主世界)
  if (!f.scene2 || !f.page1) return 'turnaround';
  if (f.endingReady) {
    const step = Number(f.endingStep) || 0;
    if (step === BOOK_READ) return null; // 找井:只留水声
    if (step === 0 && !f.earthDay) return 'turnaround'; // 地球之日:他刚来地球,好奇又孤单(2026-10-04)
    if (step >= WELL_FOUND || step === 0) return 'somewhere';
  }
  return 'salvation';
}

/** 对白进行时把音乐压低到这个比例(台词要听得清) */
export const DUCK = 0.4;
/** 换曲淡出/淡入秒数 */
export const FADE_S = 2.5;
