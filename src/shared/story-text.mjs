// story-text.mjs — 剧情台词单一数据源(2026-09-07,据《中文文学译本》/《定稿全本》)
// 2026-10-05 台词三合一:全剧本台词(开场/主线/六星/328-330/地球日/找井/告别/尾声/书页)
// 都在本文件,原 story-text-late.mjs 与 ending-text.mjs 已并入;中英对照由
// src/__tests__/story-text-parity.test.js 结构性钉死(加台词漏译/漏声线,单测直接红)。
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
// 已显示文本 → 原双语条目(2026-10-03 测试反馈:「切到中文,按钮变了台词没变」)。
// 场景代码打开对话时传的是 tt() 之后的字符串,对话框不知道原条目;记下来,
// 切换语言时对话框/排队中的台词就能就地换成另一种语言(retranslate)。
const _shown = new Map();
// 取当前语言文本(单语显示,不堆叠)
export function tt(entry) {
  if (!entry) return '';
  const s = entry[_lang] ?? entry.en ?? entry.zh ?? String(entry);
  if (typeof entry === 'object' && typeof s === 'string' && s) {
    if (_shown.size > 20000) _shown.clear(); // 封顶(正常游玩远到不了)
    _shown.set(s, entry);
  }
  return s;
}
/** 把一段已经显示过的文本换成当前语言;不是来自 tt() 的文本原样返回 */
export function retranslate(text) {
  if (typeof text !== 'string') return text;
  const entry = _shown.get(text);
  return entry ? tt(entry) : text;
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
  // 互动选项提示(2026-09-26 主人报「对话对情节的指引不清晰」):轮到玩家开口时,
  // 对话框底部亮出此行 —— 玩家知道剧情在等自己点选,不再像卡死
  turnHint: { en: 'Your turn — tap a reply below.', zh: '轮到你开口——点一句回应。' },
  // B612 首进下一步指引(2026-09-27 指引规矩③:进图只报地名不够,直说「去哪+怎么去」;
  // 章节推进后不再唠叨,planets.js 以 chapter===0 判定)
  b612NextHint: {
    en: "Next: the King's star, 325 — tap the button below.",
    zh: '下一步：去 325 国王星球——点屏幕下方的按钮。',
  },
  // 三协议并列面板(P1-1,2026-09-23):闸门底行点开后,同一面板内三标签切换
  pact: {
    tos: { en: 'Terms of Service', zh: '用户协议' },
    privacy: { en: 'Privacy Policy', zh: '隐私保护指引' },
    community: { en: 'Community Guidelines', zh: '社区公约' },
    agreeTos: {
      en: 'I have read and agree to the Terms of Service',
      zh: '我已完整阅读并同意《用户协议》',
    },
    agreePrivacy: {
      en: 'I have read and agree to the Privacy Policy',
      zh: '我已完整阅读并同意《隐私保护指引》',
    },
    agreeCommunity: {
      en: 'I have read and agree to the Community Guidelines',
      zh: '我已完整阅读并同意《社区公约》',
    },
    next: { en: 'Read, next ›', zh: '已读，下一份 ›' },
    finish: { en: 'All three read — back to gate', zh: '三份已阅，返回闸门' },
    back: { en: '‹  Back to gate', zh: '‹  返回闸门' },
    progress: { en: 'read {n} / 3', zh: '已阅 {n} / 3' },
  },
};

// 坠机点与开场引导(英文照 Woods,中文据《中文文学译本》)
export const STORY = {
  princeWake: {
    who: { en: 'The Little Prince', zh: '小王子', spk: 'prince' },
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
    { en: 'Welcome to B612, little visitor.', zh: '欢迎来到 B612，小客人。' },
    { en: 'A hat is only a hat — unless you look with your heart.', zh: '帽子不过是帽子——除非你用心去看。' },
    { en: 'My book left its ending unfinished. Perhaps you will write it.', zh: '我的书还没有写完结尾。也许，由你来写。' },
    { en: 'All the stars are yours tonight.', zh: '今夜满天星星，都是你的。' },
  ],
  rose: [{ en: 'Let the tigers come with their claws!', zh: '让老虎带着爪子来吧！' }],
  king: [
    { en: 'Ah! Here is a subject.', zh: '啊！来了一个臣民。' },
    { en: 'They obey instantly. I do not permit insubordination.', zh: '它们立刻服从。我不容许抗命。' },
    { en: 'That will be this evening about twenty minutes to eight. And you will see how well I am obeyed.', zh: '大约在今晚七点四十分。到时你就知道，我的话，它们句句都听。' },
    { en: 'I made you my Ambassador.', zh: '我封你做我的大使！' },
  ],
};

// 第 2 场·画羊四笔(2026-09-07;台词照 Woods,中文据《中文文学译本》/《定稿全本》)
// who 亦是 {en,zh}(对话框说话人随语言)。four rounds + 满意对话 + 羊初声。
// spk = 对话框说话人视觉类型(gameshell 按 [data-spk] 换边框/名牌配色)
const PRINCE = { en: 'The Little Prince', zh: '小王子', spk: 'prince' };
const PILOT = { en: 'The Pilot', zh: '飞行员', spk: 'pilot' };
const SHEEP = { en: 'The Sheep (in the box)', zh: '箱子里的羊', spk: 'sheep' };
const ROSE = { en: 'The Rose', zh: '玫瑰', spk: 'rose' };
// 狐狸(2026-10-03 新增,站五·苹果树下)。音色复用 king 的 edge-tts 跨场声线
// (prince=Milo / sheep=Mia / king=en-GB-RyanNeural / tippler=en-US-EricNeural);
// 狐狸与国王永不同屏,故可跨场复用,见 AGENTS.md 声线分配条。
const FOX = { en: 'The Fox', zh: '狐狸', spk: 'en-US-RogerNeural' };
const KING = { en: 'The King', zh: '国王', spk: 'king' };
// ============ 说话人总表(2026-10-05 台词三合一:原 ending-text.mjs WHO,全剧本唯一说话人来源) ============
// 后段(328-330)/地球日/结局各场的 who 都从这里取;spk = 朗读声线(dialog-voice.mjs 登记表)
export const WHO = {
  prince: { en: 'The Little Prince', zh: '小王子', spk: 'prince' },
  pilot: { en: 'The Pilot', zh: '飞行员', spk: 'pilot' },
  sheep: { en: 'The Sheep (in the box)', zh: '箱子里的羊', spk: 'sheep' },
  businessman: { en: 'The Businessman', zh: '商人', spk: 'king' },
  lamplighter: { en: 'The Lamplighter', zh: '点灯人', spk: 'tippler' },
  geographer: { en: 'The Geographer', zh: '地理学家', spk: 'king' },
  snake: { en: 'The Snake', zh: '蛇', spk: 'vain' },
  flower: { en: 'The Flower', zh: '小花', spk: 'rose' },
  echo: { en: 'The Echo', zh: '回声', spk: 'pilot' },
  roses: { en: 'The Roses', zh: '玫瑰们', spk: 'rose' },
  fox: { en: 'The Fox', zh: '狐狸', spk: 'en-US-RogerNeural' },
  // 字幕 = 飞行员的旁白(全书叙述者)
  caption: { en: '', zh: '', spk: 'pilot' },
};
// 后段/结局各节惯用简写(原 late/ending 两文件各自的 const P/S/C,收拢为一份)
const P = WHO.prince,
  S = WHO.sheep,
  C = WHO.caption,
  B = WHO.businessman,
  L = WHO.lamplighter,
  G = WHO.geographer;

// 说话人视觉类型查询(who 缺 spk 时回退空串=默认羊皮卷样式)
export function whoSpk(who) {
  return (who && who.spk) || '';
}
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
  countingWho: { en: 'The Sheep (in the box)', zh: '箱子里的羊', spk: 'sheep' },
  doorGlowHint: {
    en: 'In the night, the stone door begins to glow...',
    zh: '夜色里，石门亮了起来。',
  },
  // 石门亮起后的行动指引(2026-09-26 主人报「指引不清晰」):台词只说「亮了」,
  // 玩家在黑夜里不知道要走进去 —— toast 直说下一步(夜里 14m 外光晕不够醒目)
  gotoGate: {
    en: 'The stone door is glowing— step into the light.',
    zh: '石门亮了——走进那道光。',
  },
  // 书页一完成回到黑夜现实后(2026-09-27「剧情发展指引不清」补齐):
  // 玩家不知道同一扇石门现在通往 B612 —— toast 直说 + 光柱信标复立
  gotoB612: {
    en: 'The story continues on B612 — step into the stone door again.',
    zh: '故事在 B612 继续——再走进一次石门。',
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
    { who: PRINCE, en: 'Sometimes there is no harm in putting off a piece of work until another day. But when it is a matter of baobabs, that always means a catastrophe.', zh: '有时候，把活儿留到明天做，\n也没什么害处。\n可只要关系到猴面包树，\n那就准是场大祸。' },
  ],
  sunset: [
    { who: PRINCE, en: 'I am very fond of sunsets. Come, let us go look at a sunset now.', zh: '我很喜欢日落。\n走，我们现在就去看一次日落。' },
    { who: PRINCE, en: 'But we must wait.', zh: '可是得等。' },
    { who: PRINCE, en: 'Wait? For what?', zh: '等？等什么？' },
    { who: PRINCE, en: 'For the sunset. We must wait until it is time.', zh: '等日落啊。\n得等到时候。' },
    { who: PRINCE, en: 'I am always thinking that I am at home!', zh: '我总以为自己还在家里呢！' },
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

// 第 4 场·书页二·玫瑰(2026-09-07;玫瑰开花+相处+离别,照 Woods/文学译本;
// 2026-09-27 补齐定稿全本 v2 第4场开篇:入梦清晨的诘问 7 句 + 眼泪字幕 + 玫瑰初醒,
// 此前实现从"你多美啊"直接开场,开篇整段缺失)
export const SCENE4 = {
  // 入梦,清晨:他想起谁敷衍过他,对着一朵不存在的花生气(说话人归属照定稿本,全王子)
  interrogation: [
    { who: PRINCE, en: 'A sheep-- if it eats little bushes, does it eat flowers, too?', zh: '羊要是吃小灌木，\n那它吃不吃花呢？' },
    { who: PRINCE, en: 'Even flowers that have thorns?', zh: '长了刺的花也吃？' },
    { who: PRINCE, en: 'Then the thorns-- what use are they?', zh: '那刺——有什么用呢？' },
    { who: PRINCE, en: "I don't believe you! Flowers are weak creatures. They are naïve. They reassure themselves as best they can. They believe that their thorns are terrible weapons...", zh: '我不信你的话！\n花是弱小的东西。她们天真。\n她们只能尽量壮自己的胆，\n相信自己的刺是可怕的武器……' },
    { who: PRINCE, en: 'You talk just like the grown-ups!', zh: '你说话就跟那些大人一个样！' },
    { who: PRINCE, en: 'You mix everything up together... You confuse everything...', zh: '你把什么都搅在一起……\n你把一切都弄混了……' },
    { who: PRINCE, en: "I know a planet where there is a certain red-faced gentleman. He has never smelled a flower. He has never looked at a star. He has never loved any one. He has never done anything in his life but add up figures. And all day he says over and over, just like you: 'I am busy with matters of consequence!' And that makes him swell up with pride. But he is not a man-- he is a mushroom!", zh: '我知道一颗星球上，\n住着一位红脸膛的先生。\n他从来没有闻过一朵花，\n没有望过一颗星星，从来没有爱过谁。\n他一辈子除了加数字什么也没做过。\n他整天翻来覆去地说——跟你一样——\n“我在忙正经大事！”\n说得自己都骄傲起来。\n可他不是人——他是一朵蘑菇！' },
  ],
  tearsCaption: {
    en: 'It is such a secret place, the land of tears.',
    zh: '眼泪的国度，\n是多么秘密的地方。',
  },
  arrival: [
    { who: ROSE, en: 'Ah! I am scarcely awake. I beg that you will excuse me. My petals are still all disarranged...', zh: '啊……我还没完全醒来。\n请原谅。\n花瓣都还没有理好……' },
    { who: PRINCE, en: 'Oh! How beautiful you are!', zh: '哦！你多美啊！' },
    { who: ROSE, en: 'Am I not? And I was born at the same moment as the sun...', zh: '是吗？我和太阳，是同一刻出生的……' },
    { who: ROSE, en: 'Let the tigers come with their claws!', zh: '让老虎带着爪子来吧！' },
    { who: PRINCE, en: 'There are no tigers on my planet, and anyway, tigers do not eat weeds.', zh: '我的星球上没有老虎。再说，老虎也不吃草。' },
    { who: ROSE, en: 'I am not a weed. Please excuse me... I am not at all afraid of tigers, but I have a horror of drafts. I suppose you wouldn\'t have a screen for me?', zh: '我不是草。请你原谅……\n老虎我一点儿也不怕，\n我只怕穿堂风。\n你这里，可有屏风？' },
    { who: ROSE, en: 'At night I want you to put me under a glass globe. It is very cold where you live.', zh: '夜里，我要你把我罩进玻璃罩。\n你住的地方，很冷。' },
    { who: SHEEP, en: 'Flowers make me sneeze. But I like this one.', zh: '花会让我打喷嚏。\n不过这一朵，我喜欢。' },
  ],
  regret: [
    { who: PRINCE, en: 'I ought not to have listened to her. One never ought to listen to the flowers. One should simply look at them and breathe their fragrance.', zh: '我本不该听她说话的。\n花的话，永远不该听，\n只要看她们，闻她们的香气就好。' },
    { who: PRINCE, en: 'The fact is that I did not know how to understand anything! I ought to have judged by deeds and not by words. She cast her fragrance and her radiance over me. I ought never to have run away from her... I ought to have guessed all the affection that lay behind her poor little strategems. Flowers are so inconsistent! But I was too young to know how to love her...', zh: '其实那时候，我什么都不懂！\n我该看她的行动，不该听她的言语。\n她给我香气，给我光。\n我根本不该逃走……\n她那些可怜的小诡计后面，\n全是柔情，我早该猜到。\n花就是这样，口是心非！\n可我太年轻了，\n还不知道怎么去爱她……' },
  ],
  farewell: [
    { who: PRINCE, en: 'Goodbye.', zh: '再见。' },
    { who: PILOT, en: 'But it was not because she had a cold.', zh: '可她咳嗽，\n并不是因为着凉。' },
    { who: ROSE, en: 'I have been silly. I ask your forgiveness. Try to be happy...', zh: '从前是我傻。\n请你原谅我。\n你要幸福……' },
    { who: ROSE, en: 'Of course I love you. It is my fault that you have not known it all the while. That is of no importance. But you-- you have been just as foolish as I. Try to be happy... let the glass globe be. I don\'t want it any more.', zh: '我当然是爱你的。\n这你一直都不知道，是我的错——\n罢了，这不重要。\n可你呢，你也和我一样傻。\n愿你幸福。\n玻璃罩，就免了吧，我不要了。' },
    { who: PRINCE, en: 'But the wind--', zh: '可是风——' },
    { who: ROSE, en: 'My cold is not so bad as all that... the cool night air will do me good. I am a flower.', zh: '我的咳嗽没那么要紧……\n夜里的凉气对我有好处。\n我是一朵花。' },
    { who: PRINCE, en: 'But the animals--', zh: '可是虫子——' },
    { who: ROSE, en: 'Well, I must endure the presence of two or three caterpillars if I wish to become acquainted with the butterflies. It seems that they are very beautiful. And if not the butterflies-- and the caterpillars-- who will call upon me? You will be far away... as for the large animals-- I am not at all afraid of any of them. I have my claws.', zh: '唉，想认识蝴蝶，\n总得忍受两三条毛毛虫。\n听说蝴蝶美极了。\n要是没有蝴蝶，也没有毛毛虫，\n还有谁来看我呢？\n你就要走得远远的了……\n至于大动物，我才不怕。\n我有我的爪子。' },
    { who: ROSE, en: "Don't linger like this. You have decided to go away. Now go!", zh: '别这样磨蹭了。\n你既然决定要走——\n那么，走吧！' },
    { who: SHEEP, en: 'Goodbye.', zh: '再见。' },
  ],
  farewellCaption: {
    en: 'For she did not want him to see her crying. She was such a proud flower...',
    zh: '她不肯让他看见她的眼泪。\n她是一朵，多么骄傲的花……',
  },
};
// 第 6 场·书页四·325 国王(2026-09-20 情节阶段一;台词照《定稿全本》第 6 场)
// chain1 = 入梦到求日落;chain2 = 日落敕令演出之后(审判自己/老耗子/封大使/退场+羊箱吐槽)。
export const SCENE5 = {
  chain1: [
    { who: KING, en: 'Ah! Here is a subject.', zh: '啊！来了一个臣民。' },
    { who: KING, en: 'Approach, so that I may see you better.', zh: '走近些，\n好让我看清楚你。' },
    { who: PRINCE, en: '(a yawn) I can\'t help it. I can\'t stop myself. I have come on a long journey, and I have had no sleep...', zh: '（打了个哈欠）\n我忍不住。\n我走了很远的路，一直没睡……' },
    { who: KING, en: 'It is contrary to etiquette to yawn in the presence of a king. I forbid you to do so.', zh: '在国王面前打哈欠，于礼不合。\n我禁止你。' },
    { who: KING, en: 'Ah, then. I order you to yawn. It is years since I have seen anyone yawning. Yawns, to me, are objects of curiosity. Come, now! Yawn again! It is an order.', zh: '那么，我命令你打哈欠。\n多少年没见人打哈欠了。哈欠于我，是稀罕物。\n来，再打一个！这是命令。' },
    { who: PRINCE, en: 'Sire-- over what do you rule?', zh: '陛下——您统治什么？' },
    { who: KING, en: 'Over everything.', zh: '统治一切。' },
    { who: PRINCE, en: 'And the stars obey you?', zh: '星星也听您的？' },
    { who: KING, en: 'Certainly they do. They obey instantly. I do not permit insubordination.', zh: '当然听。它们立刻服从。\n我不容许抗命。' },
    { who: PRINCE, en: 'I should like to see a sunset... do me that kindness... Order the sun to set...', zh: '我想看一次日落……\n行行好……命令太阳落下去吧……' },
    { who: KING, en: 'You shall have your sunset. I shall command it. But, according to my science of government, I shall wait until conditions are favorable.', zh: '你会看到你的日落的，我会下令。\n只是按治国的道理，\n得等时机成熟。' },
    { who: PRINCE, en: 'When will that be?', zh: '那要等到什么时候？' },
    { who: KING, en: 'Hum! Hum! That will be about-- about-- that will be this evening about twenty minutes to eight. And you will see how well I am obeyed.', zh: '嗯……嗯……大约在——\n大约在今晚七点四十分。\n到时你就知道，\n我的话，它们句句都听。' },
  ],
  chain2: [
    { who: KING, en: 'Then you shall judge yourself. That is the most difficult thing of all. It is much more difficult to judge oneself than to judge others. If you succeed in judging yourself rightly, then you are indeed a man of true wisdom.', zh: '那你就审判你自己吧。\n这是所有事里最难的一件：\n审判自己，远比审判别人难。\n你要是能审得自己公道，\n才算真正的智者。' },
    { who: KING, en: 'I have good reason to believe that somewhere on my planet there is an old rat. I hear him at night. From time to time you will condemn him to death. But you will pardon him on each occasion; for he must be treated thriftily. He is the only one we have.', zh: '我有充分的根据相信，\n我的星球上住着一只老耗子，夜里我听得见它。\n你可以时不时判它死刑——\n但每一次都要赦免。\n得省着用，\n它是我们仅有的一只。' },
    { who: PRINCE, en: 'If Your Majesty wishes to be promptly obeyed, he should be able to give me a reasonable order. He should be able, for example, to order me to be gone by the end of one minute. It seems to me that conditions are favorable...', zh: '陛下若是想让人立刻服从，\n就该下合理的命令。\n比如，命令我在一分钟之内离开。\n依我看，时机正好……' },
    { who: KING, en: 'I made you my Ambassador.', zh: '我封你做我的大使！' },
    { who: PRINCE, en: '(to himself) The grown-ups are very strange.', zh: '（自言自语）\n大人们真是奇怪。' },
    { who: SHEEP, en: 'He rules everything, you know. Especially the sunsets.', zh: '你知道的，\n他统治一切——尤其是日落。' },
    { who: SHEEP, en: 'I am glad I am not a rat.', zh: '幸好我不是耗子。' },
  ],
  // 行动指引与演出旁白(2026-09-26 指引三件套规矩②③ 扩展到 325 章:台词只讲戏,
  // 「接下来去哪」由 toast 直说 + 光柱信标 storyBeaconMote 指,双语随语言切换)
  sunsetVoice: {
    en: 'Seven-forty. The horizon caught fire. The King stood with his arms crossed, motionless.',
    zh: '七点四十分。天边烧起来了。国王抱着手臂，纹丝不动。',
  },
  pickupToast: {
    en: 'A stardust glows on the isle — go and pick it up',
    zh: '岛上有一颗星屑亮了起来——去拾起它',
  },
  pickedToast: { en: 'Stardust picked · The King', zh: '拾获星屑 · 国王之星' },
  doneToast: {
    en: 'Page IV is written. The gate ring has changed its colour.',
    zh: '书页四，写完了。门环换了颜色。',
  },
  // 回程石环指引(2026-09-27 点亮死代码:拾星后门亮+光柱,toast 直说「怎么回去」)
  gotoDoor: {
    en: 'The return ring is lit — step through it to go back to B612.',
    zh: '回程石环亮了——走进去，回 B612。',
  },
};

// B612 重访入场白(2026-09-27 主人报「进入 B612 后没有任何台词」):
// 回忆演出只播一次,之后 B612 是哑巴世界 —— 王子每章亲口欢迎一句,
// 第二句由调用方配 storyNext 下一步(任务册同源),双语随语言切换
export const B612_RETURN = {
  who: PRINCE,
  line: {
    en: 'You came back. The stars kept your place.',
    zh: '你回来了。星星们，给你留着位置呢。',
  },
};

// 第 7 场上半·书页五·326 虚荣的人(2026-09-27 情节阶段二;台词照《定稿全本》第 7 场上半)
// 拍手演出:定稿"拍了五分钟"译成 4s 蒙太奇(toast 三声啪 + 停顿),不做可点击互动 ——
// 回忆是"看完一页",玩家在回忆里是幽灵,不动手只观看(定稿规则一)。
const VAIN = { en: 'The Conceited Man', zh: '虚荣的人', spk: 'vain' };
export const SCENE7_VANITY = {
  chainA: [
    { who: VAIN, en: 'Ah! Ah! I am about to receive a visit from an admirer!', zh: '啊！啊！\n有一位仰慕者，正朝我走来！' },
    { who: PRINCE, en: 'That is a queer hat you are wearing.', zh: '你戴的这顶帽子真古怪。' },
    { who: VAIN, en: 'It is a hat for salutes. It is to raise in salute when people acclaim me. Unfortunately, nobody at all ever passes this way.', zh: '这是致意用的帽子。\n人们喝彩时，我便举帽还礼。\n可惜，这里从来没有路人。' },
    { who: VAIN, en: 'Clap your hands, one against the other.', zh: '请把双手合起来拍——\n一只手，拍另一只手。' },
  ],
  clapToast: {
    en: 'Clap. Clap. Clap — (five minutes pass.)',
    zh: '啪。啪。啪——（五分钟过去了）',
  },
  chainB: [
    { who: PRINCE, en: 'And what should one do to make the hat come down?', zh: '那么，怎样它才会放下来呢？' },
    { en: 'Conceited people never hear anything but praise.', zh: '虚荣的人，\n除了赞美，什么也听不见。' },
    { who: VAIN, en: 'Do you really admire me very much?', zh: '你真的很仰慕我吗？' },
    { who: PRINCE, en: 'But you are the only man on your planet!', zh: '可这星球上，只有你一个人呀！' },
    { who: VAIN, en: 'Do me this kindness. Admire me just the same.', zh: '那就劳驾你，\n照样仰慕我吧。' },
    { who: SHEEP, en: 'I would clap too, but I am asleep.', zh: '我也想拍手，\n可我还睡着呢。' },
  ],
  pickupToast: {
    en: 'A stardust glows on the isle — go and pick it up',
    zh: '岛上有一颗星屑亮了起来——去拾起它',
  },
  pickedToast: { en: 'Stardust picked · The Conceited Man', zh: '拾获星屑 · 虚荣之星' },
  doneToast: {
    en: '326 is written. One more star tonight.',
    zh: '326，写完了。今晚还有一颗星。',
  },
};

// 第 7 场下半·书页五·327 酒鬼(2026-09-27 情节阶段二;台词照《定稿全本》第 7 场下半)
// 流程:进 king327(325 已完成)→ 导语(PLANETS tts)→ 十问答链(王子四问/酒鬼四答)→
//   沉默演出(酒鬼把自己关进去,2.2s 停顿)→ 羊吐槽 → 独白 → 星屑拾取(3m)→
//   章节推进 planetsChapter=3(书页五完成;326 留白后补)
//   → 回程石环亮起 → 走进石环回 B612。TIPPLER 无 spk=默认羊皮卷样式。
const TIPPLER = { en: 'The Tippler', zh: '酒鬼', spk: 'tippler' };
export const SCENE7_TIPPLER = {
  chain: [
    { who: PRINCE, en: 'What are you doing there?', zh: '你在那儿做什么呢？' },
    { who: TIPPLER, en: 'I am drinking.', zh: '我在喝酒。' },
    { who: PRINCE, en: 'Why are you drinking?', zh: '你为什么要喝酒？' },
    { who: TIPPLER, en: 'So that I may forget.', zh: '为了可以忘记。' },
    { who: PRINCE, en: 'Forget what?', zh: '忘记什么？' },
    { who: TIPPLER, en: 'Forget that I am ashamed.', zh: '忘记我的羞愧。' },
    { who: PRINCE, en: 'Ashamed of what?', zh: '羞愧什么？' },
    { who: TIPPLER, en: 'Ashamed of drinking!', zh: '羞愧喝酒！' },
    { who: SHEEP, en: 'I do not drink. Grass is enough for me.', zh: '我不喝酒。\n草就很好。' },
    { who: PRINCE, en: '(to himself) The grown-ups are certainly very, very odd.', zh: '（自言自语）\n大人们真是非常、非常奇怪。' },
  ],
  // 行动指引与完成旁白(同 325 规制:toast 直说 + 光柱信标,双语随语言切换)
  pickupToast: {
    en: 'A stardust glows on the isle — go and pick it up',
    zh: '岛上有一颗星屑亮了起来——去拾起它',
  },
  pickedToast: { en: 'Stardust picked · The Tippler', zh: '拾获星屑 · 酒鬼之星' },
  doneToast: {
    en: 'Page V is written. The gate ring has changed its colour.',
    zh: '书页五，写完了。门环换了颜色。',
  },
};

// ============ 玩家互动节点(2026-09-26 主人令「不仅仅是在放台词」) ============
// 三个「轮到玩家开口」的回应选择:选项标签 → 玩家回应行(pilot,自动朗读) → 王子接话。
// 所有分支汇合主线,不产生持久分叉(对话感,不做剧情树)。
export const REPLIES = {
  // 节点1·叫醒词后(王子:「请你——给我画一只羊!」)
  wake: {
    choices: [
      {
        label: { en: 'A sheep? What for?', zh: '一只羊？你要羊做什么？' },
        pilot: { who: PILOT, en: 'A sheep? Whatever for?', zh: '一只羊？你要羊做什么呀？' },
        prince: { who: PRINCE, en: 'If you draw me one, I will tell you everything.', zh: '你画给我，\n我就把什么都告诉你。' },
      },
      {
        label: { en: 'Alright, let me think how to draw it.', zh: '好，让我想想怎么画。' },
        pilot: { who: PILOT, en: 'Alright. Let me think how to draw a sheep.', zh: '好，让我想想，\n一只羊该怎么画。' },
        prince: { who: PRINCE, en: 'You have been thinking about it for six years already. Be quick!', zh: '你已经想了六年啦，\n快一点！' },
      },
      {
        label: { en: 'I draw badly, forgive me.', zh: '我画得不好，见笑了。' },
        pilot: { who: PILOT, en: 'I draw badly. Forgive me in advance.', zh: '我画得不好，\n你可别嫌弃。' },
        prince: { who: PRINCE, en: 'It does not matter. Draw the one in your heart.', zh: '没关系。\n画出你心里的那只就好。' },
      },
    ],
  },
  // 节点2·画羊收束(王子:「瞧!他睡着了……」之后)
  drawn: {
    choices: [
      {
        label: { en: 'Will it keep you company?', zh: '它会陪着你吗？' },
        pilot: { who: PILOT, en: 'Will it keep you company?', zh: '它会陪着你吗？' },
        prince: { who: PRINCE, en: 'At night, it watches the stars with me from its box.', zh: '到了夜里，\n它会在箱子里陪我数星星。' },
      },
      {
        label: { en: 'What if it runs away?', zh: '要是它跑了呢？' },
        pilot: { who: PILOT, en: 'What if it runs away?', zh: '要是它跑了呢？' },
        prince: { who: PRINCE, en: 'I have a rope and a stake. -- Just teasing. It will miss me.', zh: '我有绳子和桩子呀。\n——开玩笑的，\n它会想我的。' },
      },
    ],
  },
  // 节点3·夜里数数仪式(羊:「一……二……三……」之后)
  night: {
    choices: [
      {
        label: { en: 'What is it counting in there?', zh: '它在里面数什么？' },
        pilot: { who: PILOT, en: 'What is it counting in there?', zh: '它在里面数什么呢？' },
        prince: { who: PRINCE, en: 'Its stars. Sheep dream of stars when they sleep.', zh: '数它的星星。\n羊睡着了，\n会梦见星星。' },
      },
      {
        label: { en: 'Is the little fellow asleep?', zh: '小家伙睡了吗？' },
        pilot: { who: PILOT, en: 'Is the little fellow asleep?', zh: '小家伙睡了吗？' },
        prince: { who: PRINCE, en: 'Shh-- it is counting. Let it count.', zh: '嘘——它在数数呢。\n让它数完。' },
      },
    ],
  },
};

// ============================================================================
// 站五·狐狸(2026-10-03,剧本定稿第 10 场站五 / 原著 Ch.21)
// 英文逐字照搬剧本定稿(Woods 译本口径),中文为文学自译。一句不改。
// 场景资产:models/hall/b612-world/fox-scene.glb(主人提供的"小王子与狐狸"整场布景,
// 25 meshes:Escenario 地面 / Nubes 云 / Hojas 叶簇 1792 面 / Principito 王子 / Zorro 狐狸)。
// ============================================================================
export const SCENE_FOX = {
  who: { fox: FOX, prince: PRINCE, sheep: SHEEP },

  // —— 初遇:草地上的一问一答 ——
  greet: [
    {
      who: FOX,
      en: 'Good morning. I am right here, under the apple tree.',
      zh: '早上好。我就在这儿，苹果树下。',
    },
    { who: PRINCE, en: 'Come and play with me. I am so unhappy.', zh: '来跟我玩吧。我好难过。' },
    {
      who: FOX,
      en: 'I cannot play with you. I am not tamed.',
      zh: '我不能陪你玩。\n我还没有被驯养。',
    },
    { who: PRINCE, en: "What does that mean-- 'tame'?", zh: '“驯养”，是什么意思？' },
    { who: FOX, en: 'It means to establish ties.', zh: '意思是：建立联系。' },
  ],
  // —— 驯养的意义(原著最长一段,逐字) ——
  meaning: [
    {
      who: FOX,
      en:
        'To me, you are still nothing more than a little boy who is just like a hundred thousand other little boys. And I have no need of you. And you, on your part, have no need of me. To you, I am nothing more than a fox like a hundred thousand other foxes. But if you tame me, then we shall need each other. To me, you will be unique in all the world. To you, I shall be unique in all the world...',
      zh:
        '对我来说，你不过是个小男孩，\n和千万个小男孩没有分别。\n你对我，也和千万只狐狸没有分别。\n可一旦你驯养了我，\n我们便彼此需要——\n你于我，是天下独一个；\n我于你，也是天下独一个。',
    },
    {
      who: PRINCE,
      en: 'I am beginning to understand. There is a flower... I think that she has tamed me...',
      zh: '我有点儿懂了。\n有一朵花……\n我想，她已经把我驯养了……',
    },
    {
      who: FOX,
      en: 'The grain, which is also golden, will bring me back the thought of you. And I shall love to listen to the wind in the wheat...',
      zh: '麦子也是金黄色的，\n它会让我想起你。\n从此我会爱上，\n听风吹麦浪的声音。',
    },
    { who: FOX, en: 'Please-- tame me!', zh: '求你——驯养我吧！' },
  ],
  // —— 仪式:耐心与语言 ——
  rite: [
    {
      who: FOX,
      en:
        'You must be very patient. First you will sit down at a little distance from me-- like that-- in the grass. I shall look at you out of the corner of my eye, and you will say nothing. Words are the source of misunderstandings. But you will sit a little closer to me, every day...',
      zh:
        '你要有耐心。\n先在离我不远处坐下——就这样——\n坐在草里，什么也别说。\n我用眼角看你。\n语言，是误会的根源。\n而你每天，\n都可以坐得更近一点……',
    },
    {
      who: FOX,
      en:
        'It would have been better to come back at the same hour. If, for example, you come at four o’clock in the afternoon, then at three o’clock I shall begin to be happy. I shall feel happier and happier as the hour advances. At four o’clock, I shall already be worrying and jumping about. I shall show you how happy I am!',
      zh:
        '你最好还在同一个时辰来。\n比方说，你四点来，\n三点起我就开始幸福；\n时间越近，我越幸福；\n到了四点，我早已坐立不安、\n欢蹦乱跳——\n我要让你看看，我有多快活！',
    },
    {
      who: FOX,
      en: 'One must observe the proper rites. They are what make one day different from other days, one hour from other hours.',
      zh: '人得守仪式……\n是仪式，让这一天不同于那一天，\n让这一刻，不同于那一刻。',
    },
  ],
  // —— 秘密:全书的题眼 ——
  secret: [
    {
      who: FOX,
      en:
        'Go and look again at the roses. You will understand now that yours is unique in all the world. Then come back to say goodbye to me, and I will make you a present of a secret.',
      zh:
        '回去，再看一眼那些玫瑰。\n你现在就会明白，\n你的那朵是天下无双的。\n然后回来同我道别——\n我要送你一件礼物，\n一个秘密。',
    },
    {
      who: FOX,
      en: 'It is only with the heart that one can see rightly; what is essential is invisible to the eye.',
      zh: '只有用心，才看得真切；\n要紧的东西，眼睛看不见。',
    },
    {
      who: PRINCE,
      en: 'What is essential is invisible to the eye.',
      zh: '要紧的东西，眼睛看不见。',
    },
    {
      who: FOX,
      en: 'It is the time you have wasted for your rose that makes your rose so important.',
      zh: '正是你为玫瑰虚掷的时光，\n才使她变得如此重要。',
    },
    { who: PRINCE, en: 'It is the time I have wasted for my rose--', zh: '是我为玫瑰虚掷的时光——' },
    {
      who: FOX,
      en: 'Men have forgotten this truth. But you must not forget it. You become responsible, forever, for what you have tamed. You are responsible for your rose...',
      zh: '人们忘了这条真理。\n可你不能忘。\n你对你驯养的东西，永远负有责任。\n你要为你的玫瑰负责……',
    },
    { who: PRINCE, en: 'I am responsible for my rose...', zh: '我要为我的玫瑰负责……' },
    { who: SHEEP, en: 'I did not understand. But I will remember.', zh: '我没听懂。\n可是我会记住。' },
  ],
};

// —— 站五 UI 文案(玩家界面语言,不冒充角色对白) ——
export const FOX_UI = {
  title: { en: 'The Fox — under the apple tree', zh: '狐狸 · 苹果树下' },
  rule: {
    en: 'The past cannot hear you. Sit with the fox, and keep what you notice.',
    zh: '过去听不见你。坐在狐狸身边，把你看见的留在手札里。',
  },
  // 驯养仪式:三次靠近(这是原著的核心机制,不是任务清单)
  approach: { en: 'Sit a little closer', zh: '再坐近一点' },
  arrived: { en: 'You are close enough. The fox stays.', zh: '够近了。狐狸留下了。' },
  patience: {
    en: 'Words are the source of misunderstandings. Say nothing for a while.',
    zh: '语言，是误会的根源。有一会儿，什么也别说。',
  },
  riteDone: { en: 'The rite is observed. Four days, one hour each.', zh: '仪式守住了。四天，每天同一个时辰。' },
  secret: { en: 'The fox has a secret for you.', zh: '狐狸要送你一个秘密。' },
  memory: { en: 'The secret, kept', zh: '那个秘密，收好了' },
};


// ============================================================================
// 第 8~10 场 3D 版台词 + 夜与夜之间的过场(2026-10-03 建;2026-10-05 台词三合一并入本文件)
// 依据《B612-剧本-定稿全本》v2 第 8、9、10 场。英文逐字照 Woods 译本(与结局同口径),
// 中文照定稿。角色台词一字不改;界面提示与过场旁白单列,不冒充角色对白。
// ============================================================================

// ===================== 第 8 场上 · 328 商人 =====================
export const SCENE8_BUSINESS = {
  chainA: [
    {
      who: B,
      en: "Three and two make five. Five and seven make twelve. Twelve and three make fifteen. Good morning. Fifteen and seven make twenty-two. Twenty-two and six make twenty-eight. I haven't time to light it again. Twenty-six and five make thirty-one. Phew!",
      zh: '三加二得五，五加七得十二，\n十二加三得十五。早上好。\n十五加七得二十二，\n二十二加六得二十八。\n没工夫再点烟了。\n二十六加五得三十一。呼！',
    },
    { who: P, en: 'Five hundred million what?', zh: '五亿个什么？' },
    {
      who: B,
      en: 'Millions of those little objects which one sometimes sees in the sky.',
      zh: '就是天上那种小东西，\n闪着光的，有几百万个。',
    },
    { who: P, en: 'Ah! You mean the stars?', zh: '啊！你是说星星？' },
    { who: B, en: "Yes, that's it. The stars.", zh: '对，就是。星星。' },
  ],
  chainB: [
    { who: P, en: 'And what do you do with these stars?', zh: '那你拿这些星星做什么？' },
    { who: B, en: 'Nothing. I own them.', zh: '什么也不做。我拥有它们。' },
    { who: P, en: 'How is it possible for one to own the stars?', zh: '人怎么可能拥有星星？' },
    { who: B, en: 'To whom do they belong?', zh: '那你说，它们属于谁？' },
    { who: P, en: "I don't know. To nobody.", zh: '不知道。谁也不属于。' },
    {
      who: B,
      en: 'Then they belong to me, because I was the first person to think of it.',
      zh: '那它们就属于我，\n因为我是头一个想到这件事的人。',
    },
    {
      who: B,
      en: 'That means that I write the number of my stars on a little paper. And then I put this paper in a drawer and lock it with a key.',
      zh: '我把星星的数目写在一张小纸上，\n把纸放进抽屉，\n用钥匙，锁好。',
    },
    {
      who: P,
      en: 'I myself own a flower, which I water every day. I own three volcanoes, which I clean out every week. It is of some use to my volcanoes, and it is of some use to my flower, that I own them. But you are of no use to the stars...',
      zh: '我自己拥有一朵花，\n天天为它浇水；\n我有三座火山，周周为它疏通。\n我拥有它们，它们便因我受益——\n你拥有星星，\n星星却因你一无所获……',
    },
    {
      who: S,
      en: 'He counts them every day. I count grass. It is greener.',
      zh: '他天天数星星。\n我天天数草。\n草更绿一些。',
    },
  ],
  game: {
    title: { en: 'Count with him', zh: '陪他数' },
    hint: {
      en: 'Tap the stars. He adds each one to his sum.',
      zh: '点天上的星星。每点一颗,他就往账上加一笔。',
    },
    total: { en: 'Total', zh: '合计' },
    done: { en: 'Locked in the drawer', zh: '锁进抽屉' },
  },
};

// ===================== 第 8 场下 · 329 点灯人 =====================
export const SCENE8_LAMP = {
  chainA: [
    {
      who: P,
      en: 'Good morning. Why have you just put out your lamp?',
      zh: '早上好。\n你为什么刚把灯熄掉？',
    },
    { who: L, en: 'Those are the orders.', zh: '这是规定。' },
    { who: P, en: 'But why have you just lighted it again?', zh: '那你为什么又点亮它？' },
    { who: L, en: 'Those are the orders.', zh: '这是规定。' },
    {
      who: P,
      en: 'There is nothing to understand. Orders are orders. Good morning.',
      zh: '没什么可懂的。\n规定就是规定。早上好。',
    },
    {
      who: L,
      en: 'The orders have not been changed. That is the tragedy! From year to year the planet has turned more rapidly and the orders have not been changed!',
      zh: '规定一直没有变——这就是悲剧！\n星球一年转得比一年快，\n规定，却始终不变！',
    },
    {
      who: L,
      en: 'The planet now makes a complete turn every minute, and I no longer have a single second for repose. Once every minute I have to light my lamp and put it out!',
      zh: '如今这颗星球一分钟转一圈，\n我连一秒也歇不得。\n每一分钟——点灯，熄灯！',
    },
  ],
  chainB: [
    {
      who: P,
      en: 'That is very funny! A day lasts only one minute, here where you live!',
      zh: '那多有趣呀！\n在你住的地方，\n一天只有一分钟！',
    },
    {
      who: L,
      en: 'It is not funny at all! While we have been talking together a month has gone by.',
      zh: '一点儿也不有趣！\n咱们俩说话这会儿，\n一个月已经过去了。',
    },
    {
      who: L,
      en: 'Yes, a month. Thirty minutes. Thirty days. Good evening.',
      zh: '是啊，一个月。\n三十分钟，三十天。晚上好。',
    },
    {
      who: P,
      en: 'Your planet is so small that three strides will take you all the way around it. To be always in the sunshine, you need only walk along rather slowly.',
      zh: '你的星球小得很，\n三大步就能绕它一圈。\n你只要慢慢走，\n就能一直待在阳光里。',
    },
    {
      who: L,
      en: "That doesn't do me much good. The one thing I love in life is to sleep.",
      zh: '那对我不顶用。\n我这一生，只爱睡觉。',
    },
    { who: P, en: "Then you're unlucky.", zh: '那你真不幸。' },
    { who: L, en: 'I am unlucky. Good morning.', zh: '我是不幸的人。早上好。' },
    {
      who: C,
      en: 'That man is the only one of them all whom I could have made my friend. But his planet is indeed too small. There is no room on it for two people...',
      zh: '这么多人里，只有他，\n是我本可以与之做朋友的。\n可他的星球实在太小，\n住不下两个人……',
    },
    {
      who: C,
      en: '...it was blest every day with 1440 sunsets!',
      zh: '……这颗星球的一天，\n能看一千四百次日落！',
    },
    {
      who: S,
      en: 'Someone should tell him he can just sleep.',
      zh: '真想告诉他，\n其实可以直接去睡觉的。',
    },
  ],
  game: {
    title: { en: 'Light the lamp with him', zh: '陪他点灯' },
    hint: {
      en: 'When night falls, light the lamp. When day comes, put it out.',
      zh: '天一黑就点灯,天一亮就熄灯。',
    },
    light: { en: 'Light the lamp', zh: '点灯' },
    out: { en: 'Put it out', zh: '熄灯' },
    day: { en: 'Day', zh: '白天' },
    night: { en: 'Night', zh: '夜里' },
    good: { en: 'Good morning. / Good evening.', zh: '早上好。/ 晚上好。' },
  },
};

// ===================== 第 9 场 · 330 地理学家 =====================
export const SCENE9_GEO = {
  chainA: [
    { who: G, en: 'Oh, look! Here is an explorer!', zh: '哦，快看！来了一位探险家！' },
    { who: P, en: 'What is a geographer?', zh: '什么是地理学家？' },
    {
      who: G,
      en: 'A geographer is a scholar who knows the location of all the seas, rivers, towns, mountains, and deserts.',
      zh: '地理学家，就是一位学者，\n知道天下的海、河、城、山、沙漠，\n都在什么地方。',
    },
    { who: G, en: 'Has it any oceans?', zh: '你们那里可有海洋？' },
    { who: G, en: "I couldn't tell you.", zh: '这我说不上来。' },
    { who: P, en: 'But you are a geographer!', zh: '可您就是地理学家呀！' },
    {
      who: G,
      en: 'Exactly. But I am not an explorer. The geographer is much too important to go loafing about.',
      zh: '正是。可我不是探险家。\n地理学家何等尊贵，\n岂能四处游荡。',
    },
    {
      who: G,
      en: 'Because an explorer who told lies would bring disaster on the books of the geographer. So would an explorer who drank too much.',
      zh: '说谎的探险家，\n会毁掉地理学家的书；\n贪杯的，也一样。',
    },
    {
      who: G,
      en: 'But you-- you come from far away! You are an explorer! You shall describe your planet to me!',
      zh: '可是你——你来自远方！\n你是探险家！\n快，把你的星球讲给我听！',
    },
  ],
  flower: [
    { who: P, en: 'I have also a flower.', zh: '我还有一朵花。' },
    {
      who: G,
      en: 'We do not record flowers. We do not record them because they are ephemeral.',
      zh: '花，我们不录。\n不录，因为花是朝生暮死的东西。',
    },
    { who: P, en: "What does that mean-- 'ephemeral'?", zh: '“朝生暮死”，\n是什么意思？' },
    {
      who: G,
      en: "It means, 'which is in danger of speedy disappearance.'",
      zh: '意思就是：\n转眼就要消失的意思。',
    },
  ],
  chainB: [
    {
      who: P,
      en: 'My flower is ephemeral, and she has only four thorns to defend herself against the world. And I have left her on my planet, all alone!',
      zh: '我的花，朝生暮死。\n她只有四根刺，\n去抵挡整个世界——\n而我，把她独自留在了星球上！',
    },
    { who: C, en: 'That was his first moment of regret.', zh: '这是他生平第一次，感到后悔。' },
    {
      who: P,
      en: 'What place would you advise me to visit now?',
      zh: '那么依您看，\n我接下来该去哪里？',
    },
    {
      who: G,
      en: 'The planet Earth. It has a good reputation.',
      zh: '去地球吧。\n地球的名声很好。',
    },
    {
      who: S,
      en: 'They do not record flowers. But I will remember this one.',
      zh: '他们不记花。\n可我会记得这一朵。',
    },
  ],
  game: {
    title: { en: 'Describe his planet', zh: '讲讲他的星球' },
    hint: {
      en: 'The geographer writes down what you tell him. Tap each thing on B612.',
      zh: '地理学家把你讲的记下来。把 B612 上的东西逐一点给他听。',
    },
    items: [
      { key: 'v1', en: 'An active volcano', zh: '一座活火山', ok: true },
      { key: 'v2', en: 'Another active volcano', zh: '又一座活火山', ok: true },
      { key: 'v3', en: 'An extinct volcano', zh: '一座死火山', ok: true },
      { key: 'rose', en: 'A flower', zh: '一朵花', ok: false },
    ],
    recorded: { en: 'Recorded', zh: '已记下' },
    refused: { en: 'Not recorded — ephemeral', zh: '不录——朝生暮死' },
  },
};

// ===================== 第 10 场 · 地球之日(沙漠里的四站;狐狸站见 story-text SCENE_FOX) =====================
const SNAKE = WHO.snake,
  FLOWER = WHO.flower,
  ECHO = WHO.echo,
  ROSES = WHO.roses;
export const SCENE10 = {
  snake: [
    { who: P, en: 'I came down very near here.', zh: '一年前，我就落在离这里很近的地方。' },
    { who: C, en: 'a coil of gold, the color of the moonlight', zh: '一环金影，色如月光。' },
    {
      who: P,
      en: 'Good evening. What planet is this on which I have come down?',
      zh: '晚上好。\n我落下来的，是什么地方？',
    },
    { who: SNAKE, en: 'This is the Earth; this is Africa.', zh: '这是地球；这里是非洲。' },
    { who: P, en: 'Ah! Then there are no people on the Earth?', zh: '啊！地球上没有人吗？' },
    {
      who: SNAKE,
      en: 'This is the desert. There are no people in the desert. The Earth is large.',
      zh: '这里是沙漠。\n沙漠里没有人。\n地球大得很。',
    },
    {
      who: P,
      en: 'I wonder whether the stars are set alight in heaven so that one day each one of us may find his own again... Look at my planet. It is right there above us. But how far away it is!',
      zh: '我常想，星星是不是都亮着灯，\n好让每个人有一天，\n能重新找到自己那一颗……\n看，我的星球就在我们头顶上。\n可是它好远啊。',
    },
    {
      who: SNAKE,
      en: 'It is beautiful. What has brought you here?',
      zh: '真美。是什么风把你吹来的？',
    },
    {
      who: P,
      en: 'I have been having some trouble with a flower.',
      zh: '我为一朵花，\n闹了点别扭。',
    },
    {
      who: P,
      en: 'Where are the men? It is a little lonely in the desert...',
      zh: '人都到哪儿去了？\n沙漠里，有点儿孤单……',
    },
    { who: SNAKE, en: 'It is also lonely among men.', zh: '在人群中间，也一样孤单。' },
    {
      who: P,
      en: 'You are a funny animal. You are no thicker than a finger...',
      zh: '你真是个奇怪的动物。\n你还没有一根手指粗……',
    },
    {
      who: SNAKE,
      en: 'But I am more powerful than the finger of a king.',
      zh: '可我比国王的手指，\n更有力量。',
    },
    {
      who: SNAKE,
      en: 'I can carry you farther than any ship could take you.',
      zh: '我能送你去的地方，\n比任何船都远。',
    },
    {
      who: SNAKE,
      en: 'Whomever I touch, I send back to the earth from whence he came. But you are innocent and true, and you come from a star...',
      zh: '谁碰到我，\n我就把谁送回他来的地方。\n可你是天真无邪的，\n你来自星星……',
    },
    {
      who: SNAKE,
      en: 'I can help you, some day, if you grow too homesick for your own planet.',
      zh: '哪天你想家想得受不住了，\n我可以帮你。',
    },
    { who: P, en: 'But why do you always speak in riddles?', zh: '你为什么说话总打谜语？' },
    { who: SNAKE, en: 'I solve them all.', zh: '所有的谜，我都能解开。' },
    { who: S, en: 'Stay close to the box.', zh: '离箱子近一点。' },
  ],
  flower: [
    { who: P, en: 'Where are the men?', zh: '人都到哪儿去了？' },
    {
      who: FLOWER,
      en: 'I think there are six or seven of them in existence. I saw them, several years ago. But one never knows where to find them. The wind blows them away. They have no roots, and that makes their life very difficult.',
      zh: '我想，他们统共也就六七个吧。\n好几年前见过一回。\n谁知道如今在哪儿呢——\n风一吹，就散了。\n他们没有根，\n日子自然难。',
    },
  ],
  echo: [
    { who: P, en: 'Good morning.', zh: '早上好。' },
    {
      who: ECHO,
      en: 'Good morning-- Good morning-- Good morning.',
      zh: '早上好——早上好——早上好。',
    },
    { who: P, en: 'Be my friends. I am all alone.', zh: '做我的朋友吧。我一个人。' },
    { who: ECHO, en: 'I am all alone-- all alone-- all alone.', zh: '我一个人——一个人——一个人——' },
    {
      who: C,
      en: 'On my planet I had a flower; she always was the first to speak...',
      zh: '在我的星球上，我有一朵花。\n说话的，总是她……',
    },
  ],
  roses: [
    { who: ROSES, en: 'We are roses.', zh: '我们是玫瑰。' },
    {
      who: C,
      en: 'And here were five thousand of them, all alike, in one single garden!',
      zh: '就在这同一个花园里，\n竟有五千朵玫瑰，朵朵一模一样！',
    },
    {
      who: P,
      en: "I thought that I was rich, with a flower that was unique in all the world; and all I had was a common rose. A common rose, and three volcanoes that come up to my knees-- and one of them perhaps extinct forever... that doesn't make me a very great prince...",
      zh: '我原以为自己富有，\n拥有天下无双的一朵花——\n其实不过一朵寻常玫瑰。\n寻常的玫瑰，\n加三座齐膝的火山，\n其中一座，或许永远熄灭了……\n这样的王子，实在算不得伟大……',
    },
    { who: C, en: 'And he lay down in the grass and cried.', zh: '他躺在草里，哭了。' },
    { who: S, en: 'Why is he crying? It is only roses.', zh: '他为什么哭呀？\n不过是玫瑰嘛。' },
  ],
  rosesAgain: [
    {
      who: P,
      en: 'You are not at all like my rose. As yet you are nothing. No one has tamed you, and you have tamed no one...',
      zh: '你们一点也不像我的那朵玫瑰。\n你们现在还什么都不是。\n没有人驯养过你们，\n你们也没有驯养过谁。',
    },
    {
      who: P,
      en: 'You are beautiful, but you are empty. One could not die for you. Of course, an ordinary passerby would think that my rose looked just like you. But in herself alone she is more important than all the hundreds of you other roses: because it is she that I have watered; because it is she that I have put under the glass globe; because it is she that I have sheltered behind the screen; because it is for her that I have killed the caterpillars (but except the two or three we saved to become butterflies); because it is she that I have listened to, when she grumbled, or boasted, or even sometimes when she said nothing. Because she is my rose.',
      zh: '你们很美，可是你们是空的。\n谁也不会为你们赴死。\n寻常的路人会把你们当成我的玫瑰。\n可她独自一人，\n就胜过你们这千百朵：\n因为我给她浇过水；\n因为我给她罩过玻璃罩；\n因为我给她挡过屏风；\n因为我为她除过毛毛虫\n（只留下两三条，好让她们变成蝴蝶）；\n因为我听过她抱怨，听过她自夸，\n甚至听过她沉默。\n因为她是我的玫瑰。',
    },
  ],
};

// ===================== 地球之日 · 界面文案(不是台词) =====================
export const EARTH_UI = {
  chapter: { en: 'Page VIII · a day on Earth', zh: '书页八 · 地球之日' },
  hint: {
    en: 'He takes you to the places where he first walked on Earth. Follow the arrow.',
    zh: '他带你去他刚来地球时走过的地方。跟着箭头走。',
  },
  stops: {
    snake: { en: 'The snake · where he came down', zh: '蛇 · 他落下的地方' },
    flower: { en: 'A flower with three petals', zh: '三瓣小花' },
    echo: { en: 'The mountain and its echo', zh: '山与回声' },
    roses: { en: 'The rose garden', zh: '玫瑰园' },
    fox: { en: 'The fox · under the apple tree', zh: '狐狸 · 苹果树下' },
    rosesAgain: { en: 'Back to the roses', zh: '回到玫瑰园' },
    foxAgain: { en: 'Back to the fox — the secret', zh: '回到狐狸身边 · 那个秘密' },
  },
  listen: { en: 'Listen', zh: '听' },
  findRose: {
    en: 'Which one is his rose? Look for the glass globe.',
    zh: '哪一朵是他的玫瑰?找那只玻璃罩。',
  },
  done: { en: 'Page VIII is written. Tonight, the well.', zh: '书页八,写完了。今夜,去找井。' },
};

// ===================== 夜与夜之间的过场(旁白=飞行员;Woods 原文) =====================
// 每段回忆之间,沙漠里过去了一天。过场卡替玩家走完这段路:不必再回沙漠、再穿石门、再点按钮。
export const VOYAGE = {
  king325: {
    kicker: { en: 'Day four in the desert · water for four more days', zh: '沙漠第四天 · 水还够喝四天' },
    night: { en: 'The fourth night', zh: '第四夜' },
    title: { en: 'Page IV · The King', zh: '书页四 · 国王' },
    line: {
      en: 'He found himself in the neighbourhood of the asteroids 325, 326, 327, 328, 329, and 330. He began, therefore, by visiting them, in order to add to his knowledge.',
      zh: '他来到了 325、326、327、328、329、330 号小行星附近。\n于是他一颗一颗去拜访,\n想长长见识。',
    },
  },
  king326: {
    kicker: { en: 'Day five · a king who ruled a planet with only a rat on it', zh: '第五天 · 一个只管着一只老耗子的国王' },
    night: { en: 'The fifth night', zh: '第五夜' },
    title: { en: 'Page V · The Conceited Man', zh: '书页五 · 爱虚荣的人' },
    line: {
      en: 'The second planet was inhabited by a conceited man.',
      zh: '第二颗星球上,住着一个爱虚荣的人。',
    },
  },
  king327: {
    kicker: { en: 'The same night · he goes quiet when he talks of the tippler', zh: '同一夜 · 说到酒鬼,他不作声了' },
    night: { en: 'The same night', zh: '同一夜' },
    title: { en: 'Page V · The Tippler', zh: '书页五 · 酒鬼' },
    line: {
      en: 'The next planet was inhabited by a tippler. This was a very short visit, but it plunged the little prince into deep dejection.',
      zh: '下一颗星球上,住着一个酒鬼。\n这次拜访很短,\n却让小王子陷入深深的忧郁。',
    },
  },
  king328: {
    kicker: { en: 'Day six · two days of water left', zh: '第六天 · 水只剩两天的了' },
    night: { en: 'The sixth night', zh: '第六夜' },
    title: { en: 'Page VI · The Businessman', zh: '书页六 · 商人' },
    line: {
      en: 'The fourth planet belonged to a businessman. This man was so much occupied that he did not even raise his head at the little prince’s arrival.',
      zh: '第四颗星球属于一个商人。\n他忙得很,\n小王子来了,他连头都没抬。',
    },
  },
  king329: {
    kicker: { en: 'The same night · the lamplighter was the only one he could have made his friend', zh: '同一夜 · 点灯人,是他唯一可能交上朋友的人' },
    night: { en: 'The same night', zh: '同一夜' },
    title: { en: 'Page VI · The Lamplighter', zh: '书页六 · 点灯人' },
    line: {
      en: 'The fifth planet was very strange. It was the smallest of all. There was just enough room on it for a street lamp and a lamplighter.',
      zh: '第五颗星球非常奇怪,\n是所有星球里最小的,\n上面刚好放得下一盏路灯和一个点灯人。',
    },
  },
  king330: {
    kicker: { en: 'Day seven · one day of water left', zh: '第七天 · 水只剩一天的了' },
    night: { en: 'The seventh night', zh: '第七夜' },
    title: { en: 'Page VII · The Geographer', zh: '书页七 · 地理学家' },
    line: {
      en: 'The sixth planet was ten times larger than the last one. It was inhabited by an old gentleman who wrote voluminous books.',
      zh: '第六颗星球比上一颗大十倍,\n住着一位写大部头书的老先生。',
    },
  },
  earth: {
    kicker: { en: 'Day eight · I drink the last drop of water', zh: '第八天 · 我喝下了最后一滴水' },
    night: { en: 'The eighth day', zh: '第八天' },
    title: { en: 'Page VIII · The Earth', zh: '书页八 · 地球' },
    line: {
      en: 'So then the seventh planet was the Earth. The Earth is not just an ordinary planet!',
      zh: '于是,第七颗星球,就是地球。\n地球可不是一颗普通的星球!',
    },
  },
  ui: {
    // 默认眉题;每站自带 kicker(飞行员的沙漠日子 + 水的倒数)优先
    kicker: {
      en: 'Morning in the desert · the pilot works on his engine',
      zh: '沙漠的早晨 · 飞行员修着发动机',
    },
    travelling: { en: 'Travelling…', zh: '启程中……' },
    go: { en: 'Continue', zh: '继续' },
    stay: { en: 'Stay here a little longer', zh: '在这里再待一会儿' },
  },
};


// ============================================================================
// 书页六~九 + 尾声(2026-10-03「先做结局」;2026-10-05 台词三合一并入本文件)
// 规矩:角色台词一字不改;界面提示(UI)与台词分开存放,不冒充角色对白。
// ============================================================================

// ===================== 临时画册页(书页六、七、八) =====================
// art = 书页插画的程序化铅笔稿键(ui/book-pages.js 的 SKETCH 表)
export const BOOK_PAGES = [
  {
    page: 6,
    title: { en: 'Page VI · 328 & 329', zh: '书页六 · 328 与 329' },
    place: { en: 'The businessman, and the lamplighter', zh: '商人，与点灯人' },
    spreads: [
      {
        art: 'businessman',
        lines: [
          { who: P, en: 'And what do you do with these stars?', zh: '那你拿这些星星做什么？' },
          { who: WHO.businessman, en: 'Nothing. I own them.', zh: '什么也不做。我拥有它们。' },
          {
            who: WHO.businessman,
            en: 'That means that I write the number of my stars on a little paper. And then I put this paper in a drawer and lock it with a key.',
            zh: '我把星星的数目写在一张小纸上，\n把纸放进抽屉，\n用钥匙，锁好。',
          },
        ],
      },
      {
        art: 'businessman',
        lines: [
          {
            who: P,
            en: 'I myself own a flower, which I water every day. I own three volcanoes, which I clean out every week. It is of some use to my volcanoes, and it is of some use to my flower, that I own them. But you are of no use to the stars...',
            zh: '我自己拥有一朵花，\n天天为它浇水；\n我有三座火山，周周为它疏通。\n我拥有它们，它们便因我受益——\n你拥有星星，\n星星却因你一无所获……',
          },
          {
            who: S,
            en: 'He counts them every day. I count grass. It is greener.',
            zh: '他天天数星星。\n我天天数草。\n草更绿一些。',
          },
        ],
      },
      {
        art: 'lamplighter',
        lines: [
          {
            who: P,
            en: 'Good morning. Why have you just put out your lamp?',
            zh: '早上好。\n你为什么刚把灯熄掉？',
          },
          { who: WHO.lamplighter, en: 'Those are the orders.', zh: '这是规定。' },
          {
            who: WHO.lamplighter,
            en: 'The planet now makes a complete turn every minute, and I no longer have a single second for repose. Once every minute I have to light my lamp and put it out!',
            zh: '如今这颗星球一分钟转一圈，\n我连一秒也歇不得。\n每一分钟——点灯，熄灯！',
          },
          {
            who: P,
            en: 'That is very funny! A day lasts only one minute, here where you live!',
            zh: '那多有趣呀！\n在你住的地方，\n一天只有一分钟！',
          },
        ],
      },
      {
        art: 'lamplighter',
        lines: [
          {
            who: C,
            en: 'That man is the only one of them all whom I could have made my friend. But his planet is indeed too small. There is no room on it for two people...',
            zh: '这么多人里，只有他，\n是我本可以与之做朋友的。\n可他的星球实在太小，\n住不下两个人……',
          },
          {
            who: C,
            en: '...it was blest every day with 1440 sunsets!',
            zh: '……这颗星球的一天，\n能看一千四百次日落！',
          },
          {
            who: S,
            en: 'Someone should tell him he can just sleep.',
            zh: '真想告诉他，\n其实可以直接去睡觉的。',
          },
        ],
      },
    ],
  },
  {
    page: 7,
    title: { en: 'Page VII · 330', zh: '书页七 · 330' },
    place: { en: 'The geographer', zh: '地理学家' },
    spreads: [
      {
        art: 'geographer',
        lines: [
          {
            who: WHO.geographer,
            en: 'Oh, look! Here is an explorer!',
            zh: '哦，快看！来了一位探险家！',
          },
          {
            who: WHO.geographer,
            en: 'A geographer is a scholar who knows the location of all the seas, rivers, towns, mountains, and deserts.',
            zh: '地理学家，就是一位学者，\n知道天下的海、河、城、山、沙漠，\n都在什么地方。',
          },
          { who: P, en: 'I have also a flower.', zh: '我还有一朵花。' },
          {
            who: WHO.geographer,
            en: 'We do not record flowers. We do not record them because they are ephemeral.',
            zh: '花，我们不录。\n不录，因为花是朝生暮死的东西。',
          },
        ],
      },
      {
        art: 'geographer',
        lines: [
          {
            who: P,
            en: "What does that mean-- 'ephemeral'?",
            zh: '“朝生暮死”，\n是什么意思？',
          },
          {
            who: WHO.geographer,
            en: "It means, 'which is in danger of speedy disappearance.'",
            zh: '意思就是：\n转眼就要消失的意思。',
          },
          {
            who: P,
            en: 'My flower is ephemeral, and she has only four thorns to defend herself against the world. And I have left her on my planet, all alone!',
            zh: '我的花，朝生暮死。\n她只有四根刺，\n去抵挡整个世界——\n而我，把她独自留在了星球上！',
          },
          {
            who: C,
            en: 'That was his first moment of regret.',
            zh: '这是他生平第一次，感到后悔。',
          },
        ],
      },
      {
        art: 'geographer',
        lines: [
          {
            who: P,
            en: 'What place would you advise me to visit now?',
            zh: '那么依您看，\n我接下来该去哪里？',
          },
          {
            who: WHO.geographer,
            en: 'The planet Earth. It has a good reputation.',
            zh: '去地球吧。\n地球的名声很好。',
          },
          {
            who: S,
            en: 'They do not record flowers. But I will remember this one.',
            zh: '他们不记花。\n可我会记得这一朵。',
          },
        ],
      },
    ],
  },
  {
    page: 8,
    title: { en: 'Page VIII · The Earth', zh: '书页八 · 地球之日' },
    place: { en: 'The snake, the flower, the echo, the roses, the fox', zh: '蛇、小花、回声、玫瑰园、狐狸' },
    spreads: [
      {
        art: 'snake',
        lines: [
          {
            who: C,
            en: 'a coil of gold, the color of the moonlight',
            zh: '一环金影，色如月光。',
          },
          { who: WHO.snake, en: 'This is the Earth; this is Africa.', zh: '这是地球；这里是非洲。' },
          {
            who: P,
            en: 'Where are the men? It is a little lonely in the desert...',
            zh: '人都到哪儿去了？\n沙漠里，有点儿孤单……',
          },
          { who: WHO.snake, en: 'It is also lonely among men.', zh: '在人群中间，也一样孤单。' },
          {
            who: WHO.snake,
            en: 'I can help you, some day, if you grow too homesick for your own planet.',
            zh: '哪天你想家想得受不住了，\n我可以帮你。',
          },
        ],
      },
      {
        art: 'echo',
        lines: [
          {
            who: WHO.flower,
            en: 'I think there are six or seven of them in existence. I saw them, several years ago. But one never knows where to find them. The wind blows them away. They have no roots, and that makes their life very difficult.',
            zh: '我想，他们统共也就六七个吧。\n好几年前见过一回。\n谁知道如今在哪儿呢——\n风一吹，就散了。\n他们没有根，\n日子自然难。',
          },
          { who: P, en: 'Be my friends. I am all alone.', zh: '做我的朋友吧。我一个人。' },
          {
            who: WHO.echo,
            en: 'I am all alone-- all alone-- all alone.',
            zh: '我一个人——一个人——一个人——',
          },
        ],
      },
      {
        art: 'roses',
        lines: [
          { who: WHO.roses, en: 'We are roses.', zh: '我们是玫瑰。' },
          {
            who: C,
            en: 'And here were five thousand of them, all alike, in one single garden!',
            zh: '就在这同一个花园里，\n竟有五千朵玫瑰，朵朵一模一样！',
          },
          {
            who: C,
            en: 'And he lay down in the grass and cried.',
            zh: '他躺在草里，哭了。',
          },
        ],
      },
      {
        art: 'fox',
        lines: [
          {
            who: WHO.fox,
            en: 'I cannot play with you. I am not tamed.',
            zh: '我不能陪你玩。\n我还没有被驯养。',
          },
          { who: WHO.fox, en: 'It means to establish ties.', zh: '意思是：建立联系。' },
          { who: WHO.fox, en: 'Please-- tame me!', zh: '求你——驯养我吧！' },
        ],
      },
      {
        art: 'fox',
        lines: [
          {
            who: WHO.fox,
            en: 'It is only with the heart that one can see rightly; what is essential is invisible to the eye.',
            zh: '只有用心，才看得真切；\n要紧的东西，眼睛看不见。',
          },
          {
            who: WHO.fox,
            en: 'It is the time you have wasted for your rose that makes your rose so important.',
            zh: '正是你为玫瑰虚掷的时光，\n才使她变得如此重要。',
          },
          {
            who: WHO.fox,
            en: 'Men have forgotten this truth. But you must not forget it. You become responsible, forever, for what you have tamed. You are responsible for your rose...',
            zh: '人们忘了这条真理。\n可你不能忘。\n你对你驯养的东西，永远负有责任。\n你要为你的玫瑰负责……',
          },
          {
            who: S,
            en: 'I did not understand. But I will remember.',
            zh: '我没听懂。\n可是我会记住。',
          },
        ],
      },
    ],
  },
];

// ===================== 第 11 场 · 找井 =====================
export const SCENE_WELL = {
  // 出发:水壶空了
  start: [
    { who: P, en: 'I am thirsty, too. Let us look for a well...', zh: '我也渴了。\n我们去找一口井吧……' },
    { who: P, en: 'Water may also be good for the heart...', zh: '水，对心也是有好处的……' },
    { who: S, en: 'I know where water is. Inside melons.', zh: '我知道哪儿有水——\n瓜的里面。' },
  ],
  // 走着走着(按距离进度触发,每句一次)
  walk: [
    {
      who: P,
      en: 'The stars are beautiful, because of a flower that cannot be seen.',
      zh: '星星这样美，\n是因为有一朵看不见的花。',
    },
    { who: P, en: 'The desert is beautiful.', zh: '沙漠是美的。' },
    {
      who: P,
      en: 'What makes the desert beautiful is that somewhere it hides a well...',
      zh: '沙漠之所以美，\n是因为在某处，\n它藏着一口井……',
    },
    {
      who: WHO.caption,
      en: 'The house, the stars, the desert-- what gives them their beauty is something that is invisible!',
      zh: '房子，星星，沙漠——\n使它们美的，\n都是看不见的东西。',
    },
    { who: S, en: 'Are we there yet?', zh: '到了吗？' },
  ],
  // 找到井,摇辘轳
  found: [
    {
      who: P,
      en: 'Do you hear? We have wakened the well, and it is singing...',
      zh: '你听见了吗？\n我们把井唤醒了，\n它在唱歌……',
    },
    {
      who: P,
      en: 'I am thirsty for this water. Give me some of it to drink...',
      zh: '我渴这水，渴了很久了。\n给我喝吧……',
    },
    {
      who: P,
      en: 'The men where you live raise five thousand roses in the same garden-- and they do not find in it what they are looking for.',
      zh: '你们住的地方的人，\n在同一个花园里种五千朵玫瑰——\n却在那里头，\n找不到他们要找的东西。',
    },
    {
      who: P,
      en: 'And yet what they are looking for could be found in one single rose, or in a little water.',
      zh: '可他们要找的东西，\n就在一朵玫瑰里，\n或一小捧水里。',
    },
    { who: P, en: 'But the eyes are blind. One must look with the heart...', zh: '可是眼睛是瞎的。\n要用心找……' },
    { who: S, en: 'It is singing! Wells know how to sing?', zh: '井在唱歌！\n井也会唱歌呀？' },
    {
      who: P,
      en: 'You must keep your promise. You know-- a muzzle for my sheep... I am responsible for this flower...',
      zh: '你得守约。\n你知道的——给我那只羊，\n画一个嘴套……\n我要对这朵花负责的……',
    },
  ],
  // 画完嘴套
  muzzle: [
    {
      who: P,
      en: 'Your baobabs-- they look a little like cabbages.',
      zh: '你画的猴面包树，\n有点儿像卷心菜。',
    },
    {
      who: P,
      en: 'Your fox-- his ears look a little like horns; and they are too long.',
      zh: '你画的狐狸——\n耳朵有点儿像角，\n还太长了。',
    },
    { who: P, en: 'Oh, that will be all right. Children understand.', zh: '哦，不要紧。\n孩子们看得懂。' },
    {
      who: P,
      en: 'You know-- my descent to the earth... Tomorrow will be its anniversary.',
      zh: '你知道吗——\n我落到地球上，\n到明天，就满一年了。',
    },
    { who: P, en: 'I came down very near here.', zh: '我就落在离这里很近的地方。' },
    {
      who: P,
      en: 'Now you must work. You must return to your engine. I will be waiting for you here. Come back tomorrow evening...',
      zh: '你去忙吧，\n去修你的发动机。\n我在这儿等你。\n明天傍晚回来找我……',
    },
    {
      who: WHO.caption,
      en: 'One runs the risk of weeping a little, if one lets himself be tamed...',
      zh: '一旦被驯养，\n就得冒一点流泪的险……',
    },
  ],
};

// ===================== 第 12 场 · 告别 =====================
export const SCENE_FAREWELL = {
  // 黄昏,墙头,和看不见的谁说话
  wall: [
    {
      who: P,
      en: 'Then you don\'t remember. This is not the exact spot.',
      zh: '原来你不记得了。\n这里，不是那个确切的地方。',
    },
    {
      who: P,
      en: 'You have good poison? You are sure that it will not make me suffer too long?',
      zh: '你的毒药灵吗？\n你担保，不会让我疼太久？',
    },
  ],
  // 玩家走近之后
  near: [
    {
      who: P,
      en: 'I am glad that you have found what was the matter with your engine. Now you can go back home--',
      zh: '你的发动机修好了，我很高兴。\n现在你可以回家了——',
    },
    { who: P, en: 'I, too, am going back home today...', zh: '而我，今天也要回家了。' },
    { who: P, en: 'It is much farther... it is much more difficult...', zh: '只是路远得多……\n也难得多……' },
    {
      who: P,
      en: "I have your sheep. And I have the sheep's box. And I have the muzzle...",
      zh: '我带着你的羊，\n带着羊的箱子，\n还带着嘴套……',
    },
    { who: S, en: 'Goodbye, friend. I am going home with him.', zh: '再见啦，朋友。\n我要跟他回家了。' },
    {
      who: P,
      en: 'It is just as it is with the flower. If you love a flower that lives on a star, it is sweet to look at the sky at night. All the stars are a-bloom with flowers...',
      zh: '就像那朵花。\n如果你爱着一朵开在星星上的花，\n夜里仰望天空，便是甜的——\n满天的星，都是花。',
    },
    {
      who: P,
      en: 'It is just as it is with the water. Because of the pulley, and the rope, what you gave me to drink was like music. You remember-- how good it was.',
      zh: '水也一样。\n因为有辘轳，有绳子，\n你给我喝的水，像音乐一样。\n你记得的——那滋味多好。',
    },
  ],
  // 天暗透,礼物
  gift: [
    {
      who: P,
      en: 'All men have the stars, but they are not the same things for different people. For some, who are travelers, the stars are guides. For others they are no more than little lights in the sky. For others, who are scholars, they are problems. For my businessman they were wealth. But all these stars are silent. You-- you alone-- will have the stars as no one else has them--',
      zh: '人人都有自己的星星，\n可星星对不同的人，是不同的东西。\n对赶路的人，星星是向导；\n对另一些人，只是天上的小灯；\n对学者，星星是难题；\n对那位商人，星星是财宝。\n而满天的星星，都不出声。\n你——只有你——\n拥有的星星，和别人都不一样——',
    },
    {
      who: P,
      en: 'In one of the stars I shall be living. In one of them I shall be laughing. And so it will be as if all the stars were laughing, when you look at the sky at night... you-- only you-- will have stars that can laugh!',
      zh: '我就住在其中一颗星星上，\n我会在其中一颗上笑。\n于是夜里你仰望星空，\n就像满天都在笑——\n你，只有你，\n拥有会笑的星星！',
    },
    {
      who: P,
      en: 'It will be as if, in place of the stars, I had given you a great number of little bells that knew how to laugh...',
      zh: '就好像我没有送你星星，\n而是送了你许许多多\n懂得笑的小铃铛……',
    },
  ],
  // 夜深,最后的路
  last: [
    {
      who: P,
      en: 'It was wrong of you to come. You will suffer. I shall look as if I were dead; and that will not be true...',
      zh: '你不该来的。你会难受的。\n我看上去会像死了一样——\n可那不是真的……',
    },
    {
      who: P,
      en: 'You understand... it is too far. I cannot carry this body with me. It is too heavy.',
      zh: '你明白的……路太远了。\n我带不走这具身体。\n它太重。',
    },
    {
      who: P,
      en: 'But it will be like an old abandoned shell. There is nothing sad about old shells...',
      zh: '可它就会像一个丢弃的旧壳。\n旧壳，没有什么可伤心的……',
    },
    {
      who: P,
      en: 'That will be so amusing! You will have five hundred million little bells, and I shall have five hundred million springs of fresh water...',
      zh: '多好玩呀！\n你有五亿个会笑的小铃铛，\n我有五亿口甜甜的泉……',
    },
    {
      who: P,
      en: 'You know-- my flower... I am responsible for her. And she is so weak! She is so naïve! She has four thorns, of no use at all, to protect herself against all the world...',
      zh: '你知道吗——我的花……\n我要对她负责。\n她那样柔弱！那样天真！\n只有四根毫无用处的刺，\n去抵挡整个世界……',
    },
    { who: P, en: 'There now-- that is all...', zh: '好了——就这样了……' },
    { who: P, en: 'Here it is. Let me go on by myself.', zh: '到了。\n让我自己走。' },
  ],
  fall: {
    en: 'He fell as gently as a tree falls. There was not even any sound, because of the sand.',
    zh: '他倒下去，\n轻得像一棵树倒下。\n一点声音也没有——\n因为脚下，是沙。',
  },
};

// ===================== 第 13 场 · 尾声 · 六年后 =====================
export const SCENE_EPILOGUE = {
  captions: [
    { en: 'And now six years have already gone by...', zh: '如今，六年已经过去了……' },
    {
      en: 'I know that he did go back to his planet, because I did not find his body at daybreak. It was not such a heavy body... and at night I love to listen to the stars. It is like five hundred million little bells...',
      zh: '我知道，他真的回到他的星球去了——\n天亮的时候，我没有找到他。\n他的身体，没有那么重……\n夜里，我爱听星星的声音。\n像五亿个小铃铛……',
    },
    {
      en: 'But there is one extraordinary thing... when I drew the muzzle for the little prince, I forgot to add the leather strap to it. He will never have been able to fasten it on his sheep. So now I keep wondering: what is happening on his planet? Perhaps the sheep has eaten the flower...',
      zh: '可是有一件奇怪的事……\n我给王子画嘴套的时候，\n忘了画上皮带。\n他永远没法给它系上了。\n于是我总在想：\n他的星球上，如今怎么样了？\n也许，羊已经把花吃了……',
    },
    {
      en: 'If a little man appears who laughs, who has golden hair and who refuses to answer questions, you will know who he is. If this should happen, please comfort me. Send me word that he has come back.',
      zh: '若有一天，\n一个笑着的小人儿出现在你面前，\n金色的头发，\n问什么，他都不答——\n你就知道是他了。\n若真有那一天，\n请安慰我，\n捎个信给我：他回来了。',
    },
  ],
  question: {
    en: 'Look up at the sky. Ask yourselves: is it yes or no? Has the sheep eaten the flower?',
    zh: '抬头，问问天空：\n是，还是不是？\n羊，把花吃了吗？',
  },
  no: {
    en: 'And there is sweetness in the laughter of all the stars.',
    zh: '满天星星的笑声里，都是甜的。',
  },
  yes: {
    en: 'And then the little bells are changed to tears...',
    zh: '于是满天的铃铛，就都化成了泪……',
  },
  close: {
    en: 'And you will see how everything changes... And no grown-up will ever understand that this is a matter of so much importance!',
    zh: '你会看见，一切都随之变了——\n而没有一个大人懂得，\n这件事竟有这样要紧。',
  },
  dedication: {
    en: 'All grownups were once children-- although few of them remember it.',
    zh: '大人都曾是孩子——\n只是记得的，没有几个。',
  },
};

// ===================== 界面提示(不是台词) =====================
export const ENDING_UI = {
  bookOpen: { en: 'The book continues — open it', zh: '这本书还没写完——翻开它' },
  bookHint: {
    en: 'The little prince told you of more nights. Read pages VI, VII and VIII.',
    zh: '小王子还讲了好几夜。读完书页六、七、八。',
  },
  turn: { en: 'Turn the page', zh: '翻页' },
  back: { en: 'Back', zh: '上一页' },
  close: { en: 'Close the book', zh: '合上书' },
  temp: {
    en: 'An illustrated page for now — this night will become a place you can walk into.',
    zh: '这一夜暂时是画册页——以后会变成能走进去的地方。',
  },
  listenTitle: { en: 'Page IX · Find the well', zh: '书页九 · 找井' },
  listenHint: {
    en: 'No compass tonight. Stand still and listen — then walk toward the sound of water.',
    zh: '今夜没有罗盘。站定，听——再朝水声走去。',
  },
  listenStill: { en: 'Listening…', zh: '在听……' },
  wellNear: { en: 'Wake the well (E / tap)', zh: '唤醒这口井(E / 点击)' },
  drawMuzzle: { en: 'Draw the muzzle (E / tap)', zh: '画嘴套(E / 点击)' },
  nextEvening: { en: 'The next evening…', zh: '第二天傍晚……' },
  farewellTitle: { en: 'Page IX · Farewell', zh: '书页九 · 告别' },
  farewellHint: { en: 'Go back to the well. He is waiting on the old stone wall.', zh: '回到井边。他坐在那堵旧石墙上等你。' },
  approach: { en: 'Go to him (E / tap)', zh: '走到他身边(E / 点击)' },
  sixYears: { en: 'Six years later', zh: '六年后' },
  answerNo: { en: 'No', zh: '没有' },
  answerYes: { en: 'Yes', zh: '吃了' },
  theEnd: { en: 'The End', zh: '完' },
  again: { en: 'Look at the stars', zh: '再看看星星' },
  share: { en: 'Save my star', zh: '保存我的星星' },
  shareLine: {
    en: 'I have stars that can laugh.',
    zh: '我有会笑的星星。',
  },
  replay: { en: 'Replay the ending', zh: '重看结局' },
};
