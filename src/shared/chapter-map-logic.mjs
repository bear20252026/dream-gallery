// chapter-map-logic.mjs — 章节地图 + 存档码纯逻辑(2026-10-03 测试建议「加存档与章节选择」)
// 章节按原著顺序;每章状态 = done / current / locked,只能回到已走过的章节或当前章,
// 不能跳到没解锁的后面(剧情是一条线,跳章会让台词和指引对不上)。
// 存档码:把剧情相关的存档键打包成一段文本,可复制保存、换设备粘贴恢复。零依赖,单测钉死。
import { PLANETS } from './planet-logic.mjs';
import { ENDING, endingReady } from './ending-logic.mjs';

/**
 * 章节表。world = 「去这一章」时要进的世界(main 表示沙漠)。
 * done(f) 用存档标志判定是否完成。f = {scene2,page1,chapter,endingStep,earthDay}
 */
export function chapterList() {
  const list = [
    {
      id: 'crash',
      world: 'main',
      title: { zh: '坠机 · 画一只羊', en: 'The crash · draw me a sheep' },
      note: { zh: '沙漠里,一个小小的声音', en: 'A small voice in the desert' },
      done: (f) => !!f.scene2,
    },
    {
      id: 'home',
      world: 'b612',
      title: { zh: 'B612 · 他的家', en: 'B612 · his home' },
      note: { zh: '火山、猴面包树、日落、玫瑰', en: 'Volcanoes, baobabs, sunsets, the rose' },
      done: (f) => !!f.page1,
    },
  ];
  PLANETS.filter((p) => p.built).forEach((p, i) =>
    list.push({
      id: 'king' + p.num,
      world: 'king' + p.num,
      title: { zh: p.num + ' · ' + p.name, en: p.num + ' · ' + p.en },
      note: { zh: '小王子的旅途', en: "The little prince's journey" },
      done: (f) => (Number(f.chapter) || 0) > i,
    })
  );
  // 书页八 · 地球之日(2026-10-04):六颗星之后,先在沙漠里走一天,再去找井
  const earthDone = (f) => !!f.earthDay || (Number(f.endingStep) || 0) > 0;
  list.push({
    id: 'earth',
    world: 'main',
    title: { zh: '书页八 · 地球之日', en: 'Page VIII · a day on Earth' },
    note: {
      zh: '蛇、花、回声、玫瑰园、狐狸',
      en: 'The snake, a flower, an echo, the roses, the fox',
    },
    done: earthDone,
    ready: (f) => endingReady(f),
  });
  list.push({
    id: 'ending',
    world: 'main',
    title: { zh: '井 · 告别 · 六年后', en: 'The well · farewell · six years later' },
    note: { zh: '回到沙漠', en: 'Back in the desert' },
    done: (f) => (Number(f.endingStep) || 0) >= ENDING.DONE,
    ready: (f) => endingReady(f) && earthDone(f),
  });
  return list;
}

/** 每章状态:第一个没完成的章 = current,它之后都 locked;结局要等 endingReady */
export function chapterStates(flags) {
  const f = flags || {};
  let currentFound = false;
  return chapterList().map((c) => {
    let state;
    if (c.done(f)) state = 'done';
    else if (!currentFound && (!c.ready || c.ready(f))) {
      state = 'current';
      currentFound = true;
    } else {
      state = 'locked';
      currentFound = true;
    }
    return { id: c.id, world: c.world, title: c.title, note: c.note, state };
  });
}

/** 能不能从地图去这一章(只许已完成或当前) */
export function canTravel(state) {
  return state === 'done' || state === 'current';
}

// —— 存档码 ——

/**
 * 本模块向 store 要的两个面,分开声明,因为**每个函数只用到其中一个**:
 * collectSave/encodeSave 只读、applySave/restoreSave 只写、importSave 两个都要。
 * 写成"整个 StoreAPI"会把"本模块不碰 getSpirits/addSpirit/houseColor…"假装成碰,
 * 而单测里的 fakeStore 恰恰只提供被真调到的那几个 —— 窄面才是可验的那一面。
 *
 * 写入方唯一:`src/state/store-api.js:211 storeApi`,挂载 `src/state/store.js:13 ctx.ui.store = storeApi`,
 * 调用点 `src/ui/chapter-map.js:213/:233/:265`(三处都传 ctx.store)。
 * 返回值按写入方的真实契约写:五枚 setter/mark 都透传"这次到底落盘没有"(DG-STATE-002),所以是 boolean;
 * 下方 applySave 只认严格 `=== false` 的理由见它自己的注释,两者是一套。
 * 钉子:src/__tests__/plane-and-save-shapes.test.js(声明的键 ≡ 文件里真调用的键,且都在 storeApi 上存在)。
 *
 * @typedef {{ flag:(name:string)=>boolean, num:(name:string)=>number, str:(name:string)=>string, json:(name:string, def:*)=>* }} SaveReader
 */

/**
 * @typedef {{ mark:(name:string)=>boolean, unmark:(name:string)=>boolean, setNum:(name:string, value:number)=>boolean, setStr:(name:string, value:string)=>boolean, setJson:(name:string, value:*)=>boolean }} SaveWriter
 */

export const SAVE_FIELDS = {
  scene2: 'flag',
  page1: 'flag',
  page2: 'flag',
  gateEntered: 'flag',
  controlsLesson: 'flag',
  planetsChapter: 'num',
  homeMemoryStep: 'num',
  kingMemoryStep: 'num',
  endingStep: 'num',
  endingAnswer: 'str',
  journeyMemories: 'json',
  portfolio: 'json',
  earthStep: 'num',
  earthDay: 'flag',
};
const PREFIX = 'B612-1-';

// 存档码长度上限(2026-10-14 第五轮审计 G 的真缺口之一)。
// 真实存档码 = 14 个字段 base64 后约 300~900 字符,4096 已经留了 4 倍余量。
// 为什么必须钳:decodeSave 是 try/catch 包住的"坏码返回 null",看起来安全,但
// `atob()` + `JSON.parse()` 对一个几 MB 的粘贴串是**在主线程上**做的活(解析器还有回退路径),
// 玩家从网页里随手复制一大段贴进来就能把游戏卡住 —— 而这不是攻击,是会用到的日常误操作。
// 判超长一律**在解码之前**:先长度后内容,顺序本身就是这道闸的意义。
export const MAX_CODE_CHARS = 4096;

function b64encode(s) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, 'utf8').toString('base64');
}
function b64decode(s) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(s)));
  return Buffer.from(s, 'base64').toString('utf8');
}

/** 读出当前剧情存档的字段值(存档码与"载入前快照"共用这一份采集逻辑,不各写一遍)
 * @param {SaveReader} store
 */
export function collectSave(store) {
  const data = {};
  for (const [k, type] of Object.entries(SAVE_FIELDS)) {
    if (type === 'flag') data[k] = store.flag(k) ? 1 : 0;
    else if (type === 'num') data[k] = store.num(k);
    else if (type === 'str') data[k] = store.str(k) || '';
    else data[k] = store.json(k, null);
  }
  return data;
}

/** 从 store 读出剧情存档 → 存档码字符串
 * @param {SaveReader} store
 */
export function encodeSave(store) {
  return PREFIX + b64encode(JSON.stringify(collectSave(store)));
}

/** 解析存档码;坏码返回 null(不抛) */
export function decodeSave(code) {
  try {
    const s = String(code || '').trim();
    if (s.length > MAX_CODE_CHARS) return null; // 钳在解码之前(见 MAX_CODE_CHARS 注释)
    if (!s.startsWith(PREFIX)) return null;
    const data = JSON.parse(b64decode(s.slice(PREFIX.length)));
    if (!data || typeof data !== 'object') return null;
    const out = {};
    for (const [k, type] of Object.entries(SAVE_FIELDS)) {
      if (!(k in data)) continue;
      const v = data[k];
      if (type === 'flag') out[k] = !!v;
      else if (type === 'num') out[k] = Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));
      else if (type === 'str') out[k] = typeof v === 'string' ? v.slice(0, 40) : '';
      else out[k] = v && typeof v === 'object' ? v : null;
    }
    return out;
  } catch (e) {
    return null;
  }
}

/**
 * 把解析好的存档写回 store(调用方随后刷新页面)。
 *
 * 存档码是玩家手上唯一的进度副本,而 localStorage 会真的写不进去(隐私模式、配额满、被策略禁用)。
 * 此前这里的写失败被整个吞掉:调用方照样 `location.reload()`,于是"载入成功"地展示一份**缺了几项**
 * 的进度 —— 而载入路径又是在覆盖旧存档,玩家看不出丢了什么,也回不去。所以必须逐字段回报。
 *
 * 判定只认**严格 `=== false`**:storeApi 的 setNum/setStr/setJson 透传的是"这次落盘成没成",
 * 但别处(含单测里的 fakeStore)的 setter 常把赋值表达式的值当返回值 —— `setNum(k, 0)` 返回 0、
 * `unmark` 返回 `delete` 的布尔。用 `!ok` 判失败会把"正常写入了一个假值"当成写失败。
 *
 * @param {SaveWriter} store
 * @param {Object<string, *>} data decodeSave 或快照里的字段值
 * @returns {{ok: boolean, failed: string[]}} failed = 没能落盘的 SAVE_FIELDS 键名
 */
export function applySave(store, data) {
  const failed = [];
  for (const [k, type] of Object.entries(SAVE_FIELDS)) {
    if (!(k in data)) continue;
    const v = data[k];
    let ok;
    if (type === 'flag') ok = v ? store.mark(k) : store.unmark(k);
    else if (type === 'num') ok = store.setNum(k, v);
    else if (type === 'str') ok = store.setStr(k, v);
    else if (v != null) ok = store.setJson(k, v);
    if (ok === false) failed.push(k);
  }
  return { ok: failed.length === 0, failed };
}

/**
 * 「载入这份存档码」的完整落盘顺序(纯逻辑,单测钉死;UI 只按 action 决定刷不刷、说什么)。
 *
 * 顺序里每一步都会真的失败(localStorage 配额满 / 隐私模式 / 被策略禁用),而 M-04 之前的写法
 * 把失败全吞了还照旧 `location.reload()`,于是"覆盖当前进度"这种不可逆操作以一句"载入成功"收场:
 *   ① 快照存不下 ⇒ **停手,一个字段都不写**。没有这份快照就没有「撤销上一次载入」,
 *      而导错码等于把玩家几个月的进度直接冲掉,冲完还看不出发生过。
 *   ② 快照存好了才覆盖字段;有项没落盘 ⇒ 不 reload。缺项的新进度立刻刷页会把提示一起冲走,
 *      停下来说清楚,玩家才能自己选「重开看看实际存下了什么」还是「撤销退回载入前」。
 *
 * @param {SaveReader & SaveWriter} store 读旧值做快照、写快照与新字段,两个面都要
 * @param {Object<string, *>} data decodeSave 的结果
 * @returns {{action: 'noBackup'|'partial'|'reload', failed: string[]}}
 */
export function importSave(store, data) {
  const snap = { at: Date.now(), data: collectSave(store) };
  if (store.setJson('saveBackup', snap) === false) return { action: 'noBackup', failed: [] };
  const { failed } = applySave(store, data);
  return { action: failed.length ? 'partial' : 'reload', failed };
}

/**
 * "载入前快照"的形状(存进 `saveBackup` 的那个对象)。
 * 写入方唯一:本文件 `importSave` 里 `const snap = { at: Date.now(), data: collectSave(store) }`。
 * 读出方:`src/ui/chapter-map.js:194 ctx.store.json('saveBackup', null)`,守卫过 `backup.data` 才摆撤销按钮。
 * `data` 是**字段值本身**而不是存档码 —— 这点写在 chapter-map.js:212 与 store-api.js:43 两处注释里,
 * 因为走 decodeSave 会被它的钳位(str 截 40、num 夹 0-99)悄悄改写,那是另一条事故线。
 * @typedef {{ at:number, data:Object<string, *> }} SaveBackup
 */

/**
 * 「撤销上一次载入」:把快照写回。
 * 只有**全部存下**才清掉 saveBackup —— 撤到一半就清快照,等于把唯一的重试依据也删了。
 * @param {SaveWriter} store
 * @param {?SaveBackup} backup importSave 写进去的那份快照(调用方已守卫过 .data 存在)
 * @returns {{action: 'partial'|'reload', failed: string[]}}
 */
export function restoreSave(store, backup) {
  const { failed } = applySave(store, (backup && backup.data) || {});
  if (!failed.length) store.setJson('saveBackup', null);
  return { action: failed.length ? 'partial' : 'reload', failed };
}
