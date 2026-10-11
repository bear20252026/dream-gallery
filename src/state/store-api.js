// store-api.js — 存档深模块·纯持久化层(2026-08-29 自 store.js 拆出)
// 拆分目的:本文件**不依赖 ctx.js**,使独立页面入口(如 lobby.html → src/room/lobby.js)
// 也能复用同一套存档语义,而不必把整个 ctx.js(GameLoop/实体注册表/输入管理器/8 个命名空间)
// 拖进轻量页面。store.js 仅负责把本 api 挂到 ctx.ui.store。
//
// 深模块:42 把 localStorage 钥匙在此登记造册(SCHEMA),键名字符串只出现在本文件。
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
//
// 读缓存(2026-10-07):rawGet 原每帧同步 localStorage.getItem(planets.js 的 ticker 每帧读
//   page1/planetsChapter 1-2 次)。写路径本就是单入口(SCHEMA 登记制,set/unmark 全走本模块),
//   故加一层内存镜像是安全的:读时先查内存,写/删时同步更新;跨标签页经 storage 事件失效
//   (该事件只在其他标签页触发)。localStorage 不可用时(隐私模式)不缓存,行为同旧。

// 六灵蕴 key 的收集顺序(与 spirits.js SPIRITS 数组同序;旧档迁移按"前 n 颗已集"重建)
const SPIRIT_ORDER = ['sprout', 'flame', 'leaf', 'snow', 'dawn', 'dusk'];

// ===================== 钥匙登记册(全站唯一出现键名字符串的地方) =====================
const SCHEMA = {
  // 数字(天穹进度/计数)
  skyMs: { key: 'kunlunSkyMs', type: 'num' }, // 天穹里程碑已达档位(25/50/75/100)
  quiz: { key: 'kunlunQuiz', type: 'num' }, // 累计答对题数
  up: { key: 'kunlunUp', type: 'num' }, // 累计上传照片数
  wishN: { key: 'kunlunWishN', type: 'num' }, // 一念数(每念=灵蕴+5,2026-09-04)
  gaze: { key: 'kunlunGaze', type: 'num' }, // AI 看图次数
  chimeLastRing: { key: 'chimeLastRing', type: 'num' }, // 风铃上次自鸣时间戳
  spiritsCount: { key: 'kunlunSpirits', type: 'num' }, // 兼容键:灵蕴数量(addSpirit 同步写)
  // 字符串
  nick: { key: 'galleryNick', type: 'str' }, // 访客昵称
  prefix: { key: 'kunlunPrefix', type: 'str' }, // 昵称前缀(六合藏梦人·)
  roomName: { key: 'roomName', type: 'str' }, // 大厅:上次使用的房间昵称(lobby.html 独立入口预填用)
  scene2: { key: 'b612Scene2', type: 'flag' }, // 画羊四笔完成标记(B612 剧本第2场)
  page1: { key: 'b612Page1', type: 'flag' }, // 书页一完成(第3场 B612 回忆夜)
  // 书页二(玫瑰相见)完成标记,2026-10-03 新增。此前书页一/二/三共用一个 page1,
  // 玩家永远看不到书页二/三;现由 scene3-memory 的 PAGE_TWO_MARK 哨兵写入。
  // 旧存档(只有 page1)照常读入,readPages() 会按 page1 兜底到 3 页,不强迫重玩。
  page2: { key: 'b612Page2', type: 'flag' },
  // 可驾驶 Piper PA-18 首次飞行记录(2026-10-03)。存 {flew, at}。
  // ⚠️ 必须在此登记 —— ctx.store.setJson 对未登记键会抛,而 plane-flight 的
  // try/catch 会静默吞掉,结果 everFlew 永远为 false(探针实测过一次假阴性)。
  planeFlown: { key: 'b612PlaneFlown', type: 'json' },
  // 站五·狐狸的驯养仪式进度(2026-10-03)。存 {days, lastDay, hour, honest}。
  // lastDay 用于"每天一次";hour 是玩家约定的时辰(原著"你最好同一个时辰来")。
  foxRite: { key: 'b612FoxRite', type: 'json' },
  lang: { key: 'scriptLang', type: 'str' }, // 剧情语言 en/zh(2026-09-07 主人定双语可切换)
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
  wishTts: { key: 'kunlunWishTts', type: 'flag' }, // 首念 TTS 已播
  resetTts: { key: 'resetTts', type: 'flag' },
  snowTts: { key: 'snowTts', type: 'flag' },
  chimeTts: { key: 'chimeTts', type: 'flag' },
  arkFlew: { key: 'arkFlew', type: 'flag' }, // 飞舟首飞完成(之后登舟直接自由飞)
  arkFFSeen: { key: 'arkFFSeen', type: 'flag' }, // 自由飞教学已播
  gateEntered: { key: 'b612GateEntered', type: 'flag' }, // 入口闸门已进过(2026-09-05:进过即永不再见闸门)
  planetsChapter: { key: 'b612PlanetChapter', type: 'num' }, // B612 六星章节进度(0..6,2026-09-05)
  genderSelected: { key: 'genderSelected', type: 'flag' }, // 性别选择已完成
  gender: { key: 'gender', type: 'str' }, // 性别(male/female)
  welcomed: { key: 'kunlunWelcomed', type: 'num' }, // 首点欢迎词 24h 节流时间戳(audio-manager)
  devId: { key: '_galDevId', type: 'str' }, // 访客设备 ID(visitor-fp 三重冗余之 localStorage 副本)
  // —— 独立子页/开机迁移豁免(键已登记;写入方无法加载 ctx.store,见各自注释) ——
  musicHistory: { key: 'musicHistory', type: 'json' }, // 音乐子页播放历史(music.html 经典脚本内联 onclick 依赖,不改模块)
  kunlunVer: { key: 'kunlunVer', type: 'str' }, // 存档版本迁移标记(index.html 开机块写入,先于一切模块)
  uiFold: { key: 'b612UiFold', type: 'json' }, // 大站位 UI 收纳状态(questHud 折叠等)
  journeyMemories: { key: 'b612JourneyMemories', type: 'json' }, // 旅途观察手札；只存已完成的回忆
  journeyTaskCheckpoint: { key: 'b612JourneyTaskCheckpoint', type: 'json' }, // 当前任务内的观察点与时间刻度
  homeMemoryStep: { key: 'b612HomeMemoryStep', type: 'num' }, // 家的四站；完成互动后才保存
  kingMemoryStep: { key: 'b612KingMemoryStep', type: 'num' }, // 国王对白/互动的六段检查点
  // 结局线(2026-10-03「先做结局」):0 未开始 · 1 画册页读完 · 2 井已找到 · 3 告别完成 · 4 尾声看完
  endingStep: { key: 'b612EndingStep', type: 'num' },
  // 尾声里玩家对「羊把花吃了吗」的回答(yes/no),分享卡片用
  endingAnswer: { key: 'b612EndingAnswer', type: 'str' },
  // 旧玩法开关(2026-10-03 主人令「先放一边」):?legacy=1 写入,默认不存在 = 只玩小王子主线
  legacy: { key: 'b612Legacy', type: 'flag' },
  // 首次操作小课已上完(2026-10-03 测试反馈:新玩家不知道怎么走/看)
  controlsLesson: { key: 'b612ControlsLesson', type: 'flag' },
  // 作品集:玩家在画板上亲手描的四幅画(shared/portfolio-logic.mjs 清洗,{boa,sheep-sick,ram,box})
  portfolio: { key: 'b612Portfolio', type: 'json' },
  // Witness-card answers for 325/326/327 (shared/witness-logic.mjs): {king325:{value}, vain326:{taps}, tippler327:{taps}}
  witness: { key: 'b612Witness', type: 'json' },
  // 玩家关掉了剧情背景音乐(右下「音乐」钮;ui/story-music.js)
  musicOff: { key: 'b612MusicOff', type: 'flag' },
  // 2026-10-04 剧本补全:地球的一天(第 10 场)走到第几站;earthDay = 地球一天走完(之后才去找井)
  earthStep: { key: 'b612EarthStep', type: 'num' },
  earthDay: { key: 'b612EarthDay', type: 'flag' },
};
function entry(name) {
  const e = SCHEMA[name];
  if (!e) throw new Error('store: 未登记的存档键「' + name + '」(先去 store-api.js SCHEMA 登记)');
  return e;
}
// 内存镜像缓存(键 → 字符串值|null)。只在本模块内读写;失效口有三个:
//   本模块写/删(rawSet/rawRemove)、跨标签页 storage 事件、测试钩 storeApi._dropCache()。
const cache = new Map();
// 写失败留痕(2026-10-11 DG-STATE-002):此前 rawSet 自吞异常又无返回值,上层 setNum/setStr/setJson/
// mark/addSpirit 全部不返回,调用方在语义上无法感知「没存进去」;而 gl-lost.js 正对着用户宣称
// 「你的进度已经保存」。现在:①rawSet 返回布尔并 console.warn(与 rawRemove 对称);②各 setter 透传;
// ③本会话是否发生过写失败置粘性旗 hasWriteFailure(),供文案按事实呈现。
let writeFailed = false;
function rawGet(key) {
  if (cache.has(key)) return cache.get(key);
  try {
    const v = localStorage.getItem(key);
    cache.set(key, v);
    return v;
  } catch (e) {
    return null; // localStorage 不可用:不缓存,每次都真试(行为同旧)
  }
}
/** @returns {boolean} true=真的落到 localStorage 了 */
function rawSet(key, v) {
  try {
    localStorage.setItem(key, v);
    cache.set(key, v);
    return true;
  } catch (e) {
    cache.delete(key); // 写入失败不缓存,保持「读到的就是真存上的」
    writeFailed = true;
    console.warn('[store] 写入持久键失败', key, e); // 与 rawRemove 对称:此前只治了删没治写
    return false;
  }
}
/** @returns {boolean} true=删除动作没报错(旧值不会在下次 rawGet 复活) */
function rawRemove(key) {
  cache.delete(key);
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    writeFailed = true;
    console.warn('[store] 删除持久键失败', key, e); // 旧值可能被下次 rawGet 读回(缓存已删)
    return false;
  }
}

// ===================== 剧情关键 checkpoint 的写失败提示(2026-10-11 DG-STATE-002) =====================
// 规矩:凡是「玩家推进剧情」的键写失败必须让用户知道一句(走既有 ctx.ui.modeToast,不新造组件);
// 普通 UI 偏好类键(折叠状态/语言/音乐开关…)失败继续静默——只有 console.warn。
// 本模块零 ctx 依赖(lobby.html 复用同层),所以提示出口由装配方注入:
//   main.js 开机 storeApi.setCriticalWriteNotifier(() => ctx.ui.modeToast && ctx.ui.modeToast(...));
// 每键每会话只提示一次(避免隐私模式访客被 toast 刷屏)。
const STORY_CHECKPOINT_KEYS = new Set([
  'scene2', // 画羊四笔完成
  'page1', // 书页一(第 3 场 B612 回忆夜)
  'page2', // 书页二(玫瑰相见)
  'planetsChapter', // B612 六星章节进度
  'homeMemoryStep', // 家的四站段落
  'kingMemoryStep', // 国王对白/互动段落
  'journeyMemories', // 旅途观察手札
  'journeyTaskCheckpoint', // 当前任务的观察点与时间刻度
  'earthStep', // 地球之日站次
  'earthDay', // 地球之日走完(结局门槛之一)
  'endingStep', // 结局线 0..4
  'endingAnswer', // 尾声回答
  'spiritsKeys', // 灵蕴库存(完成判定是数量口径)
  'spiritsCount', // 灵蕴数量兼容键
]);
let criticalNotifier = null;
const criticalNotified = new Set();
function noteCriticalFailure(name) {
  if (!STORY_CHECKPOINT_KEYS.has(name) || criticalNotified.has(name)) return;
  criticalNotified.add(name);
  if (!criticalNotifier) return;
  try {
    criticalNotifier(name);
  } catch (e) {
    console.warn('[store] 关键存档失败提示抛出异常(不影响存档本身):', e);
  }
}
/** 写路径统一收口:写失败且是关键 checkpoint → 提示一次 */
function afterWrite(name, ok) {
  if (!ok) noteCriticalFailure(name);
  return ok;
}
// 跨标签页同步:其他标签页写/清 localStorage 时,本页对应键缓存失效
// (storage 事件不在本标签页触发,本标签页的写已由 rawSet/rawRemove 同步)
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', function (e) {
    if (e.key === null) cache.clear();
    else cache.delete(e.key);
  });
}

// ===================== 接口 =====================
export const storeApi = {
  // —— 数字:等价旧写法 +(localStorage.getItem(k)||0) ——
  num(name) {
    return +(rawGet(entry(name).key) || 0);
  },
  setNum(name, v) {
    return afterWrite(name, rawSet(entry(name).key, String(v))); // 2026-10-11 DG-STATE-002:透传写入结果
  },
  // —— 字符串:等价 getItem||def ——
  str(name, def) {
    return rawGet(entry(name).key) || (def === undefined ? '' : def);
  },
  setStr(name, v) {
    return afterWrite(name, rawSet(entry(name).key, v));
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
    return afterWrite(name, rawSet(entry(name).key, JSON.stringify(v)));
  },
  // —— 一次性标记:等价 !!getItem / setItem(k,'1') ——
  flag(name) {
    return !!rawGet(entry(name).key);
  },
  mark(name) {
    return afterWrite(name, rawSet(entry(name).key, '1'));
  },
  unmark(name) {
    return rawRemove(entry(name).key); // 未登记即抛(与 num/str 同语义)
  },
  // —— 灵蕴库存(含旧档迁移,迁移逻辑从 spirits.js 收编于此) ——
  /**
   * 已收集灵蕴 key 数组。读时自证不变量(2026-10-11 DG-STATE-001):
   *   ①只认 SPIRIT_ORDER 里的合法 key(脏项不会把数量口径的完成判定 got()>=6 顶上去);
   *   ②去重(旧档含重复即清洗并回写,同一颗不能数两遍);
   *   ③只在真的发现脏项时才回写,每帧读取走快路径(顺序按首次收集顺序保留)。
   * 旧档迁移(顺序收集时代只有数量键 kunlunSpirits,前 n 颗即已集)照旧。
   */
  getSpirits() {
    let k = this.json('spiritsKeys', null);
    if (!Array.isArray(k)) {
      // 旧档:顺序收集时代只有数量键,前 n 颗即已集
      const n = Math.min(Math.max(this.num('spiritsCount'), 0), SPIRIT_ORDER.length);
      k = SPIRIT_ORDER.slice(0, n);
      rawSet(SCHEMA.spiritsKeys.key, JSON.stringify(k));
      return k;
    }
    const seen = new Set();
    const clean = [];
    for (const key of k) {
      if (!SPIRIT_ORDER.includes(key) || seen.has(key)) continue;
      seen.add(key);
      clean.push(key);
    }
    if (clean.length !== k.length) {
      // 发现脏项(重复或非法):就地清洗并同步兼容数量键(finale/settings 有按数量读取的旧逻辑)
      rawSet(SCHEMA.spiritsKeys.key, JSON.stringify(clean));
      rawSet(SCHEMA.spiritsCount.key, String(clean.length));
    }
    return clean;
  },
  /**
   * 收集一颗灵蕴。存储层自证不变量(2026-10-11 DG-STATE-001):
   *   ①key 必须 ∈ SPIRIT_ORDER,否则抛(白名单;真实流程三源天然排除已收集,这条是防线不是修 bug);
   *   ②已存在则幂等返回当前库存(不抛、不重复 push、不再写盘)。
   * @returns {string[]} 写入后的库存数组 —— 既有契约保留(spirits.js 用它取长度显示 n/6,
   *   改成布尔会炸调用方);写失败与否经 hasWriteFailure() 与本函数的关键键提示可见。
   */
  addSpirit(key) {
    if (!SPIRIT_ORDER.includes(key)) {
      throw new Error(
        'store: addSpirit 收到非法灵蕴 key「' + key + '」(合法集:' + SPIRIT_ORDER.join('/') + ')'
      );
    }
    const k = this.getSpirits();
    if (k.includes(key)) return k; // 幂等:重复添加不改变库存(完成判定是数量口径,重复计数不算数)
    k.push(key);
    rawSet(SCHEMA.spiritsKeys.key, JSON.stringify(k));
    const ok = rawSet(SCHEMA.spiritsCount.key, String(k.length)); // 兼容旧读取方(数量)
    afterWrite('spiritsKeys', ok);
    return k;
  },
  // —— 房屋分组换色(动态键 houseColor_<组名>,仅自己可见) ——
  houseColor(g) {
    return rawGet('houseColor_' + g) || '';
  },
  setHouseColor(g, hex) {
    return rawSet('houseColor_' + g, hex);
  },
  clearHouseColor(g) {
    return rawRemove('houseColor_' + g);
  },
  // —— 写失败可见性(2026-10-11 DG-STATE-002) ——
  /** 本会话是否发生过 localStorage 写/删失败(隐私模式/配额满);粘性,供文案按事实呈现 */
  hasWriteFailure() {
    return writeFailed;
  },
  /** 关键剧情 checkpoint 写失败的提示出口:装配方注入(main.js),参数为登记名 */
  setCriticalWriteNotifier(fn) {
    criticalNotifier = typeof fn === 'function' ? fn : null;
  },
  /** 清掉「每键每会话只提示一次」的登记(测试/HMR 重装配用;业务代码一般不需要) */
  resetCriticalNotified() {
    criticalNotified.clear();
  },
  /** 剧情关键 checkpoint 键集只读快照(提示文案/测试引用) */
  storyCheckpointKeys() {
    return Array.from(STORY_CHECKPOINT_KEYS);
  },
  // 测试专用(vitest 的 localStorage mock 直写 backing store,绕过本模块 → 缓存不会自动失效):
  // 两个 store 测试文件的 beforeEach 与「直写 mock 后再读」的断言前调用。业务代码勿用。
  _dropCache() {
    cache.clear();
  },
};
