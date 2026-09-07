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
  princeIdle: [
    { en: 'Where I live, everything is very small.', zh: '在我的星球上，什么都很小。' },
    { en: 'The thing that is so good about the box you have given me is that at night he can use it as his house.', zh: '这箱子最好的一点：到了夜里，羊可以拿它当房子。' },
    { en: 'Straight ahead of him, nobody can go very far…', zh: '一直朝前走，谁也走不远……' },
    { en: 'If some one loves a flower, of which just one single blossom grows in all the millions and millions of stars, it is enough to make him happy just to look at the stars.', zh: '若有人爱着一朵花，在千万颗星星里，她只开这一朵——那么他只要抬头望望星空，心里就已是幸福的。' },
  ],
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

// 第 2 场·画羊四笔(2026-09-07;台词照 Woods,中文据《中文文学译本》/《定稿全本》)
// who 亦是 {en,zh}(对话框说话人随语言)。four rounds + 满意对话 + 羊初声。
const PRINCE = { en: 'The Little Prince', zh: '小王子' };
const PILOT = { en: 'The Pilot', zh: '飞行员' };
const SHEEP = { en: 'The Sheep (in the box)', zh: '箱子里的羊' };
export const SCENE2 = {
  who: { prince: PRINCE, pilot: PILOT, sheep: SHEEP },
  hint: {
    en: 'Trace the grey lines, then tap the button.',
    zh: '照着淡灰线稿画，画好了点右下角',
  },
  doneBtn: { en: 'Done', zh: '画好了' },
  round1: {
    who: PRINCE,
    en: 'No, no, no! I do not want an elephant inside a boa constrictor. A boa constrictor is a very dangerous creature, and an elephant is very cumbersome. Where I live, everything is very small. What I need is a sheep. Draw me a sheep.',
    zh: '不不不！我不要蟒蛇肚子里的大象。\n蟒蛇太危险，大象太笨重。\n我住的地方，什么都很小。\n我要的是一只羊。给我画一只羊。',
  },
  round2: {
    who: PRINCE,
    en: 'No. This sheep is already very sickly. Make me another.',
    zh: '不行。\n这只羊病得很重。再画一只。',
  },
  round3: {
    who: PRINCE,
    en: 'You see yourself that this is not a sheep. This is a ram. It has horns.',
    zh: '你自己看看，这不是羊。\n这是公羊。它有角。',
  },
  round4: {
    who: PRINCE,
    en: 'This is only his box. The sheep you asked for is inside.',
    zh: '这只是箱子。\n你要的那只羊，就在里面。',
  },
  after: [
    { who: PRINCE, en: 'That is exactly the way I wanted it! Do you think that this sheep will have to have a great deal of grass?', zh: '这正是我想要的！\n你看这只羊要吃很多草吗？' },
    { who: PILOT, en: 'Why?', zh: '为什么？' },
    { who: PRINCE, en: 'Because where I live everything is very small...', zh: '因为我住的地方，什么都很小……' },
    { who: PILOT, en: 'There will surely be enough grass for him. It is a very small sheep that I have given you.', zh: '肯定有足够的草给它。\n我给了你一只很小很小的羊。' },
    { who: PRINCE, en: 'Not so small that-- Look! He has gone to sleep...', zh: '没有那么小——瞧！\n他睡着了……' },
  ],
  voice: [
    { who: SHEEP, en: '...Hello? Is it morning already?', zh: '……喂？天亮了吗？' },
    { who: SHEEP, en: 'You drew me. That makes me yours.', zh: '你画了我。所以我是你的。' },
    { who: SHEEP, en: 'It is dark in here, but it is a good dark.', zh: '里面很黑。\n不过黑得挺舒服。' },
    { who: SHEEP, en: 'Wake me when the stars come out.', zh: '星星出来的时候，叫醒我。' },
  ],
};

// 第 3 场·书页一(B612 家与日常;2026-09-07,台词照 Woods/文学译本)
export const SCENE3 = {
  counting: { en: 'One... two... three...', zh: '一……二……三……' },
  countingWho: { en: 'The Sheep (in the box)', zh: '箱子里的羊' },
  doorGlowHint: {
    en: 'In the night, the stone door begins to glow...',
    zh: '夜色里，石门亮了起来。',
  },
  arrival: [
    { who: PRINCE, en: 'What! You dropped down from the sky?', zh: '什么！你从天上掉下来的？' },
    { who: PRINCE, en: 'Oh! That is funny!', zh: '哦！那可真有趣！' },
    { who: PRINCE, en: 'So you, too, come from the sky! Which is your planet?', zh: '这么说，你也是从天上来的！\n你的星球是哪一颗？' },
    { who: PRINCE, en: 'The thing that is so good about the box you have given me is that at night he can use it as his house.', zh: '你给我的这箱子，\n好在夜里羊可以拿它当房子。' },
  ],
  volcanoes: {
    who: PRINCE,
    en: 'I have three volcanoes. Two volcanoes are active and the other is extinct. But one never knows.',
    zh: '我有三座火山。\n两座是活的，一座熄灭了。\n不过，谁知道呢。',
  },
  baobab: [
    { who: PRINCE, en: "It is true, isn't it, that sheep eat little bushes?", zh: '羊吃小灌木，是真的吧？' },
    { who: SHEEP, en: 'I eat little bushes. I would never eat a whole planet.', zh: '我吃小灌木。\n可不会吃掉一整个星球。' },
    { who: PRINCE, en: 'Then it follows that they also eat baobabs?', zh: '那么，它们也吃猴面包树喽？' },
    { who: PRINCE, en: 'We would have to put them one on top of the other.', zh: '那得让大象一只叠一只才行。' },
    { who: PRINCE, en: 'Before they grow so big, the baobabs start out by being little.', zh: '猴面包树长到那么大之前，\n也是从小树苗开始的。' },
    { who: PRINCE, en: "It is a question of discipline. When you've finished your own toilet in the morning, then it is time to attend to the toilet of your planet, just so, with the greatest care.", zh: '这是个规矩的问题。\n早晨梳洗完了，\n就该给星球梳洗——\n要仔细，再仔细。' },
  ],
  sunset: [
    { who: PRINCE, en: 'I am very fond of sunsets. Come, let us go look at a sunset now.', zh: '我很喜欢日落。\n走，我们现在就去看一次日落。' },
    { who: PRINCE, en: 'One day, I saw the sunset forty-four times!', zh: '有一天，我看了四十四次日落！' },
    { who: PILOT, en: 'You know-- one loves the sunset, when one is so sad...', zh: '你知道的——\n人难过的时候，\n就会爱上日落……' },
    { who: SHEEP, en: 'If you count them, I will count them with you.', zh: '你要数的话，\n我陪你一起数。' },
  ],
  exitBridge: {
    who: PRINCE,
    en: 'There you are. You were far away— did you see it too?',
    zh: '你在这儿呀。\n你刚才走了好远——你也看见了吗？',
  },
  questPage: { en: 'Pages of the book', zh: '书页' },
};