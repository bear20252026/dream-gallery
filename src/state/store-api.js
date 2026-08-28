// store-api.js — 存档深模块·纯持久化层(2026-08-29 自 store.js 拆出)
// 拆分目的:本文件**不依赖 ctx.js**,使独立页面入口(如 lobby.html → src/room/lobby.js)
// 也能复用同一套存档语义,而不必把整个 ctx.js(GameLoop/实体注册表/输入管理器/8 个命名空间)
// 拖进轻量页面。store.js 仅负责把本 api 挂到 ctx.ui.store。
//
// 深模块:24+ 把 localStorage 钥匙在此登记造册(SCHEMA),键名字符串只出现在本文件。
// 接口只有 11 个入口:num/setNum · str/setStr · json/setJson · flag/mark · getSpirits/addSpirit ·
//   houseColor/setHouseColor/clearHouseColor —— 类型转换、默认值、旧档迁移、异常兜底全部藏里面。
// 铁律:行为与旧直写 localStorage 逐点对齐——
//   num  = +(getItem||0);str = getItem||def;flag = !!getItem;json 坏数据回退 def(旧码会抛,此处更稳);
//   getSpirits 内置旧档迁移(顺序收集时代只有数量键 kunlunSpirits,前 n 颗即已集);
//   addSpirit 同步写兼容数量键 kunlunSpirits(finale/settings/ark 有按数量读取的旧逻辑)。
// 冷核心:本模块不接 HMR(与 ctx.js/overlay.js 同级);热模块一律经 ctx.store 运行时调用。
// sessionStorage 键(同意书/欢迎语等会话级)不进本模块。
// 注意:str/setStr 等方法不依赖 this,可安全地在导出的 storeApi 上直接调用;
//   仅 getSpirits/addSpirit 内部用 this(灵蕴迁移链),调用时请走 storeApi.getSpirits() 形式。

// 六灵蕴 key 的收集顺序(与 spirits.js SPIRITS 数组同序;旧档迁移按"前 n 颗已集"重建)
const SPIRIT_ORDER = ['sprout', 'flame', 'leaf', 'snow', 'dawn', 'dusk'];

// ===================== 钥匙登记册(全站唯一出现键名字符串的地方) =====================
const SCHEMA = {
  // 数字(天穹进度/计数)
  skyMs: { key: 'kunlunSkyMs', type: 'num' }, // 天穹里程碑已达档位(25/50/75/100)
  quiz: { key: 'kunlunQuiz', type: 'num' }, // 累计答对题数
  up: { key: 'kunlunUp', type: 'num' }, // 累计上传照片数
  gaze: { key: 'kunlunGaze', type: 'num' }, // AI 看图次数
  chimeLastRing: { key: 'chimeLastRing', type: 'num' }, // 风铃上次自鸣时间戳
  spiritsCount: { key: 'kunlunSpirits', type: 'num' }, // 兼容键:灵蕴数量(addSpirit 同步写)
  // 字符串
  nick: { key: 'galleryNick', type: 'str' }, // 访客昵称
  prefix: { key: 'kunlunPrefix', type: 'str' }, // 昵称前缀(六合藏梦人·)
  roomName: { key: 'roomName', type: 'str' }, // 大厅:上次使用的房间昵称(lobby.html 独立入口预填用)
  // JSON
  spiritsKeys: { key: 'kunlunSpiritsKeys', type: 'json' }, // 已集灵蕴 key 数组(乱序拾取后为权威存档)
  upHash: { key: 'kunlunUpHash', type: 'json' }, // 已传照片哈希(防重)
  letGo: { key: 'eternalLetGo', type: 'json' }, // 已"放下"的画(软删除清单)
  marks: { key: 'eternalMarks', type: 'json' }, // 晨光留影已完成标记
  eternalPicks: { key: 'eternalPicks', type: 'json' }, // C2 展厅选片导入:本人挑选≤20的上传作品名(仅自己可见)
  lowQuality: { key: 'kunlunLowQuality', type: 'json' }, // D4 低画质手动开关(true=强制流畅档)
  // 一次性标记(存在即真)
  spiritsIntro: { key: 'kunlunSpiritsIntro', type: 'flag' }, // 灵蕴序文已播
  spiritsDone: { key: 'kunlunSpiritsDone', type: 'flag' }, // 六灵蕴终章已触发
  eternalWelcomed: { key: 'eternalWelcomed', type: 'flag' }, // 永恒展厅欢迎语已播
  marksDone: { key: 'eternalMarksDone', type: 'flag' }, // 晨光留影终章已触发
  skyviewTts: { key: 'skyviewTts', type: 'flag' },
  fireTts: { key: 'fireTts', type: 'flag' },
  letgoTts: { key: 'letgoTts', type: 'flag' },
  resetTts: { key: 'resetTts', type: 'flag' },
  snowTts: { key: 'snowTts', type: 'flag' },
  chimeTts: { key: 'chimeTts', type: 'flag' },
  arkFlew: { key: 'arkFlew', type: 'flag' }, // 飞舟首飞完成(之后登舟直接自由飞)
  arkFFSeen: { key: 'arkFFSeen', type: 'flag' }, // 自由飞教学已播
  prologueDone: { key: 'kunlunPrologueDone', type: 'flag' }, // 序章已播(首访判定)
  genderSelected: { key: 'genderSelected', type: 'flag' }, // 性别选择已完成
  gender: { key: 'gender', type: 'str' }, // 性别(male/female)
};
function entry(name) {
  const e = SCHEMA[name];
  if (!e) throw new Error('store: 未登记的存档键「' + name + '」(先去 store-api.js SCHEMA 登记)');
  return e;
}
function rawGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function rawSet(key, v) {
  try {
    localStorage.setItem(key, v);
  } catch (e) {}
}

// ===================== 接口 =====================
export const storeApi = {
  // —— 数字:等价旧写法 +(localStorage.getItem(k)||0) ——
  num(name) {
    return +(rawGet(entry(name).key) || 0);
  },
  setNum(name, v) {
    rawSet(entry(name).key, String(v));
  },
  // —— 字符串:等价 getItem||def ——
  str(name, def) {
    return rawGet(entry(name).key) || (def === undefined ? '' : def);
  },
  setStr(name, v) {
    rawSet(entry(name).key, v);
  },
  // —— JSON:坏数据/缺失回退 def(旧码裸 JSON.parse 会抛,这里更稳,合法数据行为一致) ——
  json(name, def) {
    const raw = rawGet(entry(name).key);
    if (raw == null) return def;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return def;
    }
  },
  setJson(name, v) {
    rawSet(entry(name).key, JSON.stringify(v));
  },
  // —— 一次性标记:等价 !!getItem / setItem(k,'1') ——
  flag(name) {
    return !!rawGet(entry(name).key);
  },
  mark(name) {
    rawSet(entry(name).key, '1');
  },
  // —— 灵蕴库存(含旧档迁移,迁移逻辑从 spirits.js 收编于此) ——
  getSpirits() {
    let k = this.json('spiritsKeys', null);
    if (!Array.isArray(k)) {
      // 旧档:顺序收集时代只有数量键,前 n 颗即已集
      const n = Math.min(Math.max(this.num('spiritsCount'), 0), 6);
      k = SPIRIT_ORDER.slice(0, n);
      rawSet(SCHEMA.spiritsKeys.key, JSON.stringify(k));
    }
    return k;
  },
  addSpirit(key) {
    const k = this.getSpirits();
    k.push(key);
    rawSet(SCHEMA.spiritsKeys.key, JSON.stringify(k));
    rawSet(SCHEMA.spiritsCount.key, String(k.length)); // 兼容旧读取方(数量)
    return k;
  },
  // —— 房屋分组换色(动态键 houseColor_<组名>,仅自己可见) ——
  houseColor(g) {
    return rawGet('houseColor_' + g) || '';
  },
  setHouseColor(g, hex) {
    rawSet('houseColor_' + g, hex);
  },
  clearHouseColor(g) {
    try {
      localStorage.removeItem('houseColor_' + g);
    } catch (e) {}
  },
};
