// journey-voice.mjs — 旅程文案单一源(2026-11-12 世界观统一)
//
// 背景:项目原有两套世界观——昆仑/女娲补天(旧)与小王子/B612(现主线)。
// 3D 玩法层早已收口(legacy 搁置名单 + planetsMode 让沙漠光柱休眠),但**文案层仍是女娲语汇**:
// 「天穹已合」「裂痕收窄」「缝上第一针」「答对的每一道题」——玩家在小王子的沙漠里读补天叙事,
// 这是"设计混乱"的真实来源。更糟的是答题门(quiz/quizgate)已搁置,那些文案描述的玩法根本不存在了。
//
// 本模块把那套语汇整体换成小王子意象:**点亮星星 / 把这本书写完 / 日落 / 井 / 玫瑰**。
// ⚠️ 只换皮,不动机制:进度算式(上传×5 + 一念×5)、11 档里程碑阈值、存档键一律不变,
//    老玩家的既有进度原样保留,不会因为改文案而清零或回退。
// ⚠️ 不再提"答对的题":答题玩法已搁置,文案不许描述玩家做不到的事。
//
// 双语:zh/en 同行成对(与 story-progress.mjs 的 storyBeat/storyNext 同一口径)。

/** 页面标题与入口名(罗盘菜单 / 三级页标题共用) */
export const JOURNEY_TITLE = { zh: '星图', en: 'Star Map' };
/** 罗盘菜单入口按钮文字 */
export const JOURNEY_ENTRY = { zh: '🌌 星图', en: '🌌 Star Map' };
/** 六星屑页入口(名字已由 planet-logic 的星球名覆盖,这里只统一入口措辞) */
export const STARDUST_ENTRY = { zh: '✦ 六颗星', en: '✦ Six Stars' };

/**
 * 进度读数(标题行)。机制仍是 0..100,但语义从"补天率"改为"星星点亮的程度"。
 * @param {number} val 0..100
 */
export function progressTitle(val) {
  return val >= 100
    ? { zh: '星图已亮', en: 'The map is lit' }
    : { zh: '已点亮 ' + val + ' / 100', en: 'Lit ' + val + ' / 100' };
}

/** 进度副标题(阶段感,不提裂痕/缝合) */
export function progressSub(val) {
  if (val >= 100) return { zh: '每一颗星，都回到了它该在的位置。', en: 'Every star is back where it belongs.' };
  if (val >= 81) return { zh: '最后几颗星正在亮起……', en: 'The last stars are lighting up…' };
  if (val >= 51) return { zh: '星图正在成形……', en: 'The map is taking shape…' };
  if (val >= 21) return { zh: '夜空一点点亮起来……', en: 'The night sky brightens, little by little…' };
  return { zh: '第一颗星正在醒来……', en: 'The first star is waking…' };
}

/** 统计行:只列**仍然开放**的玩法(上传/一念),不再列已搁置的答题 */
export function progressStats(up, wish) {
  return {
    zh: '上传照片：' + up + ' 张 · 一念：' + wish + ' 句',
    en: 'Photos: ' + up + ' · Wishes: ' + wish,
  };
}

/** 圆满时的长文案(替代"天穹已合…新的裂痕总会生出") */
export const JOURNEY_FULL = {
  zh: '星图已亮。你带来的每一片星屑，都回到了它该在的地方。<br>这本书写完了——但 B612 不闭门。你想回来时，星星还在这里。',
  en: 'The map is lit. Every mote you brought is back where it belongs.<br>The book is written — but B612 never closes. When you wish to return, the stars will still be here.',
};

/**
 * 11 档里程碑(阈值一字不改:[5,10,20,35,50,65,80,90,95,98,100])。
 * 每项 = [阈值, 屏幕大字(zh/en), 旁白(zh/en)]。旁白不再提答题/裂痕/三千年女娲叙事。
 * @type {Array<[number, {zh:string,en:string}, {zh:string,en:string}]>}
 */
export const JOURNEY_MILESTONES = [
  [5,
    { zh: '第一颗星，亮了。', en: 'The first star is lit.' },
    { zh: '第一颗星，亮了。B612 等这一刻，等了很久。', en: 'The first star is lit. B612 has waited a long while for this.' }],
  [10,
    { zh: '夜空记住了你。', en: 'The night remembers you.' },
    { zh: '夜空记住了你。你留下的每一样东西，都在替它发光。', en: 'The night remembers you. Everything you leave behind shines for it.' }],
  [20,
    { zh: '第一缕星光，落了下来。', en: 'The first starlight falls.' },
    { zh: '第一缕星光，落了下来。你带来的星屑，开始照亮这片夜空。', en: 'The first starlight falls. The motes you brought begin to light this sky.' }],
  [35,
    { zh: 'B612 的风，忽然温柔了。', en: 'The wind on B612 turns gentle.' },
    { zh: 'B612 的风，忽然温柔了。它认出了你——那个愿意凝视的人。', en: 'The wind on B612 turns gentle. It knows you — the one who is willing to look.' }],
  [50,
    { zh: '一半的星图亮了。它记得你的每一幅画。', en: 'Half the map is lit. It remembers every drawing.' },
    { zh: '一半的星图亮了。它记得你的每一幅画，也记得你每一次低头沉思的片刻。', en: 'Half the map is lit. It remembers every drawing, and every moment you looked down in thought.' }],
  [65,
    { zh: '你听见了吗？星星在回应你。', en: 'Do you hear it? The stars answer you.' },
    { zh: '你听见了吗？星星在回应你。那是很久以来的第一声回响。', en: 'Do you hear it? The stars answer you. It is the first echo in a long, long while.' }],
  [80,
    { zh: '还差最后几颗。你听见 B612 的回音了吗？', en: 'Only a few left. Do you hear B612 echoing?' },
    { zh: '还差最后几颗。你听见 B612 的回音了吗？它说，它一直在等一个愿意把记忆带回来的旅人。', en: 'Only a few left. Do you hear B612 echoing? It says it has been waiting for a traveller willing to carry memories home.' }],
  [90,
    { zh: '星图快要亮了。最后十步。', en: 'The map is almost lit. Ten steps left.' },
    { zh: '星图快要亮了。最后十步。你走过的每一步，B612 都替你记得。', en: 'The map is almost lit. Ten steps left. B612 remembers every step you took.' }],
  [95,
    { zh: '再挂一幅。就一幅。', en: 'One more drawing. Just one.' },
    { zh: '再挂一幅。就一幅。那片夜空，在等你把它点亮。', en: 'One more drawing. Just one. That night sky is waiting for you to light it.' }],
  [98,
    { zh: '你几乎能触到整片星空了。', en: 'You can almost touch the whole sky.' },
    { zh: '你几乎能触到整片星空了。它就在你眼前，只差最后一点星屑。', en: 'You can almost touch the whole sky. It is right before you — only a little stardust left.' }],
  [100,
    { zh: '星图已亮。你做到了。', en: 'The map is lit. You did it.' },
    { zh: '星图已亮。你做到了。你带来的每一片星屑，都回到了它该在的地方。你挂过的每一幅画，都是你留给 B612 的证明。你是第一个走完这条路的人。但 B612 不闭门——你想回来时，星星还在这里。你愿意回来吗？', en: 'The map is lit. You did it. Every mote you brought is back where it belongs. Every drawing you hung is proof of what you left with B612. You are the first to walk this road to its end. But B612 never closes — when you wish to return, the stars will still be here. Will you come back?' }],
];

/**
 * 逐百分比小文案(1..99,按 val-1 索引;进度条旁显示,不播语音)。
 * 100 条位保持与旧表等长(第 100 位由 progressTitle/JOURNEY_FULL 接管,此处留空串)。
 * 语汇:星星/日落/井/玫瑰/风/画,不含补天与答题。
 * @type {Array<{zh:string,en:string}>}
 */
export const JOURNEY_LINES = [
  { zh: '第一片星屑归位。夜空轻轻动了一下。', en: 'The first mote settles. The night sky stirs.' },
  { zh: '星的边缘，有了温度。', en: 'The edge of a star grows warm.' },
  { zh: 'B612 开始记得你了。', en: 'B612 begins to remember you.' },
  { zh: '六颗星正在醒来。', en: 'Six stars are waking.' },
  { zh: '第一颗星，亮了。', en: 'The first star is lit.' },
  { zh: '星屑在夜空里汇聚。', en: 'Stardust gathers in the night.' },
  { zh: '夜空在低声回应。', en: 'The night answers softly.' },
  { zh: '你走过的每一步都算数。', en: 'Every step you took counts.' },
  { zh: '星光泛起第一层晕。', en: 'Starlight forms its first halo.' },
  { zh: '夜空记住了你的声音。', en: 'The night remembers your voice.' },
  { zh: '又一颗星的边缘开始发光。', en: 'Another star begins to glow at its edge.' },
  { zh: '第二片星光正在形成。', en: 'A second starlight is forming.' },
  { zh: '星图更亮了一寸。', en: 'The map brightens by an inch.' },
  { zh: 'B612 的风停了下来，在听。', en: 'The wind on B612 stops, and listens.' },
  { zh: '你留下的每一样东西都在发光。', en: 'Everything you left behind is shining.' },
  { zh: '星屑正向夜空汇聚。', en: 'Stardust drifts toward the night sky.' },
  { zh: '星的边缘有了金色。', en: 'Gold appears at the edge of a star.' },
  { zh: '你挂的画在 B612 生了根。', en: 'Your drawing takes root on B612.' },
  { zh: '画廊的灯，亮了一盏。', en: 'A lamp in the gallery comes on.' },
  { zh: '第一缕星光，落了下来。', en: 'The first starlight falls.' },
  { zh: '夜空的呼吸变得均匀了。', en: 'The night sky breathes evenly now.' },
  { zh: '你上传的每一张照片都在发光。', en: 'Every photo you uploaded is glowing.' },
  { zh: 'B612 记住了你的名字。', en: 'B612 remembers your name.' },
  { zh: '星屑落进夜空的声音，像风穿过琴弦。', en: 'Stardust falling sounds like wind through strings.' },
  { zh: '四分之一的星图已经亮了。', en: 'A quarter of the map is lit.' },
];

// 26..99 位:按主题循环生成,保持 100 条等长(旧表也是逐条手写,这里用语汇池组合,
// 语义一致且不再出现补天/答题词)。主题池全部来自小王子意象。
const LINE_POOL = [
  { zh: '又一颗星， quietly 亮了。', en: 'Another star quietly lights up.' },
  { zh: '日落之后，星星更清楚了。', en: 'After sunset, the stars grow clearer.' },
  { zh: '井那边传来一点水声。', en: 'A little water sounds from the well.' },
  { zh: '玫瑰的方向，有微光。', en: 'A faint light lies toward the rose.' },
  { zh: '风把星屑往上带了一点。', en: 'The wind lifts the stardust a little.' },
  { zh: '你的画在墙上轻轻发亮。', en: 'Your drawing glows softly on the wall.' },
  { zh: '夜空又深了一层。', en: 'The night deepens by one layer.' },
  { zh: 'B612 替你记着这一刻。', en: 'B612 keeps this moment for you.' },
  { zh: '星与星之间，连上了线。', en: 'A line joins star to star.' },
  { zh: '你听见自己的脚步，很轻。', en: 'You hear your own steps, very light.' },
  { zh: '有一颗星，只为你亮着。', en: 'One star shines for you alone.' },
  { zh: '这本书，又写完了一页。', en: 'Another page of the book is written.' },
];
// 修正第一条池文案里混入的英文词(保持中文纯净)
LINE_POOL[0] = { zh: '又一颗星，静静亮了。', en: 'Another star quietly lights up.' };
for (let i = JOURNEY_LINES.length; i < 99; i++) {
  JOURNEY_LINES.push(LINE_POOL[i % LINE_POOL.length]);
}
JOURNEY_LINES.push({ zh: '', en: '' }); // 第 100 位由圆满文案接管

/** 取某百分比的小文案(1..99;越界返回空串,与旧表行为一致) */
export function lineAt(val) {
  const i = Math.floor(Number(val)) - 1;
  if (!(i >= 0 && i < JOURNEY_LINES.length)) return { zh: '', en: '' };
  return JOURNEY_LINES[i];
}