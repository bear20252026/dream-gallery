// story-text-late.mjs — 第 8~10 场 3D 版台词 + 夜与夜之间的过场(2026-10-03)
// 依据《B612-剧本-定稿全本》v2 第 8、9、10 场。英文逐字照 Woods 译本(与 ending-text 同口径),
// 中文照定稿。角色台词一字不改;界面提示与过场旁白单列,不冒充角色对白。
// 说话人(含朗读声线 spk)复用 ending-text.mjs 的 WHO。
import { WHO } from './ending-text.mjs';

const P = WHO.prince,
  S = WHO.sheep,
  C = WHO.caption,
  B = WHO.businessman,
  L = WHO.lamplighter,
  G = WHO.geographer;

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
    night: { en: 'The fourth night', zh: '第四夜' },
    title: { en: 'Page IV · The King', zh: '书页四 · 国王' },
    line: {
      en: 'He found himself in the neighbourhood of the asteroids 325, 326, 327, 328, 329, and 330. He began, therefore, by visiting them, in order to add to his knowledge.',
      zh: '他来到了 325、326、327、328、329、330 号小行星附近。\n于是他一颗一颗去拜访,\n想长长见识。',
    },
  },
  king326: {
    night: { en: 'The fifth night', zh: '第五夜' },
    title: { en: 'Page V · The Conceited Man', zh: '书页五 · 爱虚荣的人' },
    line: {
      en: 'The second planet was inhabited by a conceited man.',
      zh: '第二颗星球上,住着一个爱虚荣的人。',
    },
  },
  king327: {
    night: { en: 'The same night', zh: '同一夜' },
    title: { en: 'Page V · The Tippler', zh: '书页五 · 酒鬼' },
    line: {
      en: 'The next planet was inhabited by a tippler. This was a very short visit, but it plunged the little prince into deep dejection.',
      zh: '下一颗星球上,住着一个酒鬼。\n这次拜访很短,\n却让小王子陷入深深的忧郁。',
    },
  },
  king328: {
    night: { en: 'The sixth night', zh: '第六夜' },
    title: { en: 'Page VI · The Businessman', zh: '书页六 · 商人' },
    line: {
      en: 'The fourth planet belonged to a businessman. This man was so much occupied that he did not even raise his head at the little prince’s arrival.',
      zh: '第四颗星球属于一个商人。\n他忙得很,\n小王子来了,他连头都没抬。',
    },
  },
  king329: {
    night: { en: 'The same night', zh: '同一夜' },
    title: { en: 'Page VI · The Lamplighter', zh: '书页六 · 点灯人' },
    line: {
      en: 'The fifth planet was very strange. It was the smallest of all. There was just enough room on it for a street lamp and a lamplighter.',
      zh: '第五颗星球非常奇怪,\n是所有星球里最小的,\n上面刚好放得下一盏路灯和一个点灯人。',
    },
  },
  king330: {
    night: { en: 'The seventh night', zh: '第七夜' },
    title: { en: 'Page VII · The Geographer', zh: '书页七 · 地理学家' },
    line: {
      en: 'The sixth planet was ten times larger than the last one. It was inhabited by an old gentleman who wrote voluminous books.',
      zh: '第六颗星球比上一颗大十倍,\n住着一位写大部头书的老先生。',
    },
  },
  earth: {
    night: { en: 'The eighth day', zh: '第八天' },
    title: { en: 'Page VIII · The Earth', zh: '书页八 · 地球' },
    line: {
      en: 'So then the seventh planet was the Earth. The Earth is not just an ordinary planet!',
      zh: '于是,第七颗星球,就是地球。\n地球可不是一颗普通的星球!',
    },
  },
  ui: {
    kicker: {
      en: 'Morning in the desert · the pilot works on his engine',
      zh: '沙漠的早晨 · 飞行员修着发动机',
    },
    travelling: { en: 'Travelling…', zh: '启程中……' },
    go: { en: 'Continue', zh: '继续' },
    stay: { en: 'Stay here a little longer', zh: '在这里再待一会儿' },
  },
};
