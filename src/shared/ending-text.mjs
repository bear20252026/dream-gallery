// ending-text.mjs — 书页六~九 + 尾声的台词(2026-10-03「先做结局」)
// 依据《B612-剧本-定稿全本》v2 第 8~13 场。英文逐字照 Woods 译本,中文照定稿自译。
// 规矩同 story-text.mjs:角色台词一字不改;界面提示(UI)与台词分开存放,不冒充角色对白。
//
// 书页六/七/八 = 临时「画册页」(主人 2026-10-03 批准):先用可翻的插画书页把故事接上,
// 让玩家今天就能走到结局;日后逐页换成 3D 场景时,只删 BOOK_PAGES 里对应一页即可。

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
const P = WHO.prince,
  S = WHO.sheep,
  C = WHO.caption;

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
