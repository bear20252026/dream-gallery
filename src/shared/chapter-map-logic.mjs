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
    note: { zh: '蛇、花、回声、玫瑰园、狐狸', en: 'The snake, a flower, an echo, the roses, the fox' },
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

function b64encode(s) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, 'utf8').toString('base64');
}
function b64decode(s) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(s)));
  return Buffer.from(s, 'base64').toString('utf8');
}

/** 从 store 读出剧情存档 → 存档码字符串 */
export function encodeSave(store) {
  const data = {};
  for (const [k, type] of Object.entries(SAVE_FIELDS)) {
    if (type === 'flag') data[k] = store.flag(k) ? 1 : 0;
    else if (type === 'num') data[k] = store.num(k);
    else if (type === 'str') data[k] = store.str(k) || '';
    else data[k] = store.json(k, null);
  }
  return PREFIX + b64encode(JSON.stringify(data));
}

/** 解析存档码;坏码返回 null(不抛) */
export function decodeSave(code) {
  try {
    const s = String(code || '').trim();
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

/** 把解析好的存档写回 store(调用方随后刷新页面) */
export function applySave(store, data) {
  for (const [k, type] of Object.entries(SAVE_FIELDS)) {
    if (!(k in data)) continue;
    const v = data[k];
    if (type === 'flag') v ? store.mark(k) : store.unmark(k);
    else if (type === 'num') store.setNum(k, v);
    else if (type === 'str') store.setStr(k, v);
    else if (v != null) store.setJson(k, v);
  }
}
