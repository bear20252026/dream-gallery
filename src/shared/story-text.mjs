// story-text.mjs — 剧情台词单一数据源(2026-09-07 P2:台词散在 5 处,定稿脚本只改这里)
// 收录:开场电影字幕(FILM)、小世界对话气泡(DIALOG_LINES)。
// 说明:六星球的 tts/段位文案在 src/shared/planet-logic.mjs 的 PLANETS 数据内
//(本就是数据模块,不重复搬);序章文案在 gate/prologue.js(仪式文本,与剧本分离)。
// 版权口径:台词照搬 Woods 英译公版底本(见 B612-剧情脚本-原著英文照搬版.md)。

// 开场电影字幕(挂在 #fT0/#fTq/#fReply/#fMind/#tFly1/#tFly2/#tLand/#fEnd)
export const FILM = {
  t0: 'When I was six, I drew the very first drawing of my life.',
  question: 'What is this?',
  replyHat: 'That is how every grown-up sees it.', // 选「帽子」后的回应
  replyBoa: '…Then you see it too.', // 选「蟒蛇」后的回应
  mind: 'Later, someone taught me — one must look with the heart.',
  fly1: 'Afterwards, I became a pilot.',
  fly2: 'Later still, my engine went silent over the desert.',
  land: '…and the desert received me like a page receiving ink.',
  end: '— to be continued: the B612 gallery waits beside you —',
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
