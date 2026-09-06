// story-text.mjs — 剧情台词单一数据源(2026-09-07 P2:台词散在 5 处,定稿脚本只改这里)
// 收录:开场电影字幕(FILM)、小世界对话气泡(DIALOG_LINES)。
// 说明:六星球的 tts/段位文案在 src/shared/planet-logic.mjs 的 PLANETS 数据内
//(本就是数据模块,不重复搬);序章文案在 gate/prologue.js(仪式文本,与剧本分离)。
// 版权口径:台词照搬 Woods 英译公版底本(见 B612-剧情脚本-原著英文照搬版.md)。

// 开场电影字幕(2026-09-07 对稿《中文文学译本》S1;英文照 Woods 译)
// 结构:选择题→答案句→旁白字幕(两分支)→画真相→折纸→飞行→坠机→晕睡交棒
export const FILM = {
  question: 'What is this?\n这是什么？',
  answerHat: 'That is a hat.\n那是一顶帽子。',
  answerBoa: 'It was a picture of a boa constrictor digesting an elephant.\n那是一条大蟒蛇，正在消化一头大象。',
  quoteHat:
    'Grown-ups never understand anything by themselves, and it is tiresome for children to be always and forever explaining things to them.\n大人从不自己弄懂什么，\n总要孩子一遍又一遍地讲给他们听——真累。',
  quoteBoa: 'They always need to have things explained.\n什么都得讲给他们听。',
  fly1: 'Afterwards, I became a pilot.\n后来，我成了飞行员。',
  fly2: 'Later still, my engine went silent over the desert.\n再后来，在沙漠上空，发动机没了声息。',
  crash: 'I had an accident with my plane in the Desert of Sahara. Something was broken in my engine.\n飞机在撒哈拉出了事。\n发动机里，有什么东西坏了。',
  sleep: 'The first night, then, I went to sleep on the sand, a thousand miles from any human habitation.\n头一夜，我就睡在沙上——\n方圆千里，没有人烟。',
};

// 全局文案(加载屏/闸门/任务册;据《中文文学译本》全局文案件)
export const GLOBAL = {
  loading:
    'All grownups were once children—although few of them remember it.\n大人都曾是孩子——\n只是记得的，没有几个。',
  gateDedication:
    'To Leon Werth, when he was a little boy.\n献给莱昂·维尔特——\n献给那个还是小男孩的他。',
  questMain: '把这本书，写完。 Finish the book.',
};

// 坠机点与开场引导(2026-09-07;英文照 Woods 译,中文据《中文文学译本》)
export const STORY = {
  // 小王子叫醒玩家的第一句(=主线发令枪,书内原句 Ch2)
  princeWake: {
    speaker: '小王子',
    en: 'If you please-- draw me a sheep!',
    zh: '请你——给我画一只羊！',
  },
  // 坠机残骸告示牌(木牌 CanvasTexture 双语同绘)
  wreckSign: {
    en: 'Something was broken in my engine... I was more isolated than a shipwrecked sailor on a raft in the middle of the ocean.',
    zh: '发动机里，有什么东西坏了……\n我比大洋中央抱着木筏的水手，还要孤单。',
  },
};

// 小世界情景对话(故事书小王子/玫瑰/国王;逐条轮播,全英文 Satisfy 手写体)
export const DIALOG_LINES = {
  prince: [
    'Welcome to B612, little visitor.',
    'A hat is only a hat — unless you look with your heart.',
    'My book left its ending unfinished. Perhaps you will write it.',
    'All the stars are yours tonight.',
  ],
  rose: ['Tend me, and I will be unlike any other rose in the world.'],
  king: [
    'Approach! You are my very first subject.',
    'Over my kingdom the stars obey me. I only command the sunset — it always happens at dusk.',
    'It is contrary to etiquette to yawn before a king. For you, I allow it.',
    'I command you to enjoy your stay. It will happen anyway.',
  ],
};
