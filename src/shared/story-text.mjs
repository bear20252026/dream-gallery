// story-text.mjs — 剧情台词单一数据源(2026-09-07,据《中文文学译本》/《定稿全本》)
// 双语可切换(主人定:同一位置一键切「英文版/中文版」,非上下堆叠):
//   每条 = {en, zh};显示层经 tt(entry) 取当前语言。语言由 setScriptLang() 设定
//   (入口:主进程按 ctx.store 载入;切换钮 src/ui/lang-toggle.js 翻转并发 'script:lang' 事件)。
// 版权口径:英文照 Woods 英译公版底本(中国法 2019 起 PD);中文为文学自译;羊台词原创。

let _lang = 'en';
export function setScriptLang(l) {
  _lang = l === 'zh' ? 'zh' : 'en';
}
export function scriptLang() {
  return _lang;
}
// 取当前语言文本(单语显示,不堆叠)
export function tt(entry) {
  if (!entry) return '';
  return entry[_lang] ?? entry.en ?? entry.zh ?? String(entry);
}

// 开场电影字幕(2026-09-07 对稿《中文文学译本》S1;英文照 Woods 译)
export const FILM = {
  question: { en: 'What is this?', zh: '这是什么？' },
  answerHat: { en: 'That is a hat.', zh: '那是一顶帽子。' },
  answerBoa: { en: 'It was a picture of a boa constrictor digesting an elephant.', zh: '那是一条大蟒蛇，正在消化一头大象。' },
  quoteHat: {
    en: 'Grown-ups never understand anything by themselves, and it is tiresome for children to be always and forever explaining things to them.',
    zh: '大人从不自己弄懂什么，\n总要孩子一遍又一遍地讲给他们听——真累。',
  },
  quoteBoa: { en: 'They always need to have things explained.', zh: '什么都得讲给他们听。' },
  fly1: { en: 'Afterwards, I became a pilot.', zh: '后来，我成了飞行员。' },
  fly2: { en: 'Later still, my engine went silent over the desert.', zh: '再后来，在沙漠上空，发动机没了声息。' },
  crash: {
    en: 'I had an accident with my plane in the Desert of Sahara. Something was broken in my engine.',
    zh: '飞机在撒哈拉出了事。\n发动机里，有什么东西坏了。',
  },
  sleep: {
    en: 'The first night, then, I went to sleep on the sand, a thousand miles from any human habitation.',
    zh: '头一夜，我就睡在沙上——\n方圆千里，没有人烟。',
  },
};

// 全局文案(据《中文文学译本》全局文案件)
export const GLOBAL = {
  loading: {
    en: 'All grownups were once children—although few of them remember it.',
    zh: '大人都曾是孩子——\n只是记得的，没有几个。',
  },
  gateDedication: {
    en: 'To Leon Werth, when he was a little boy.',
    zh: '献给莱昂·维尔特——\n献给那个还是小男孩的他。',
  },
  questMain: { en: 'Finish the book.', zh: '把这本书，写完。' },
};

// 坠机点与开场引导(英文照 Woods,中文据《中文文学译本》)
export const STORY = {
  princeWake: {
    speaker: '小王子',
    en: 'If you please-- draw me a sheep!',
    zh: '请你——给我画一只羊！',
  },
  wreckSign: {
    en: 'Something was broken in my engine... I was more isolated than a shipwrecked sailor on a raft in the middle of the ocean.',
    zh: '发动机里，有什么东西坏了……\n我比大洋中央抱着木筏的水手，还要孤单。',
  },
};

// 小世界情景对话(故事书小王子/玫瑰/国王;逐条轮播,全英文 Satisfy 手写体;
// 待第 3 场迁移成 {en,zh} 后随语言切换)
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