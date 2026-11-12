// kunlun/ark-routes.js — 飞舟六航路参数表(2026-11-11 巨型文件拆分:从 ark.js 抽离)
// 主人定稿文案 + 灵色 tint + 粒子色 pColor + 飞行模式 mode。纯数据,无副作用、无闭包依赖。
// 抽离原则:逐字搬运,顺序/数值/文案一字不改(航路索引 k 与 flySeg 直接按下标取,顺序敏感)。
export const ROUTES = [
  {
    name: '东线 · 朝霞航路',
    spirit: '春生之芽',
    poem: '黎明从不等人。但它等了你。',
    tint: [255, 183, 109],
    pColor: '#ffd98a',
    mode: 'rise',
  },
  {
    name: '南线 · 炽阳航路',
    spirit: '夏炽之焰',
    poem: '你曾经热爱的，从未真正离开。',
    tint: [255, 122, 74],
    pColor: '#ff6a3a',
    mode: 'rise',
  },
  {
    name: '西线 · 暮色航路',
    spirit: '秋思之叶',
    poem: '眷恋是另一种记忆方式。',
    tint: [195, 141, 158],
    pColor: '#e8a03c',
    mode: 'sway',
  },
  {
    name: '北线 · 寒夜航路',
    spirit: '冬藏之雪',
    poem: '沉默深处，有雪在说话。',
    tint: [93, 106, 142],
    pColor: '#dfeaf5',
    mode: 'fall',
  },
  {
    name: '天顶线 · 破晓航路',
    spirit: '朝露之珠',
    poem: '每一次重新开始，都是第一次。',
    tint: [135, 206, 235],
    pColor: '#7cc8e8',
    mode: 'streak',
  },
  {
    name: '归途线 · 合光航路',
    spirit: '暮光之尘',
    poem: '所有未完成的，都可以被原谅。',
    tint: [232, 200, 144],
    pColor: '#ffffff',
    mode: 'swirl',
  },
];
