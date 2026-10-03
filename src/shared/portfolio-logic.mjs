// portfolio-logic.mjs — 「未完成的画」作品集纯逻辑(2026-10-03)
// 开场说「每一幅未完成的画都在等一个人」:玩家在画板上亲手描过的四幅画
// (蟒蛇吞象 / 病羊 / 公羊 / 箱子)存进作品集,结局后在画廊里重新看到。
// 只存玩家自己的笔迹(SVG path 字符串);原著线稿由 UI 端按 id 叠在下面。零依赖,单测钉死。

export const ROUND_IDS = ['boa', 'sheep-sick', 'ram', 'box'];

export const PORTFOLIO_TITLES = {
  boa: { zh: '蟒蛇吞象', en: 'A boa digesting an elephant' },
  'sheep-sick': { zh: '生病的羊', en: 'The sick sheep' },
  ram: { zh: '有角的公羊', en: 'The ram with horns' },
  box: { zh: '箱子 · 你要的羊在里面', en: 'The box · your sheep is inside' },
};

export const MAX_STROKES = 80; // 每幅最多 80 笔
export const MAX_D_CHARS = 1600; // 单笔路径最长 1600 字符(超长截断尾部,防 localStorage 膨胀)

/** 把点列画成顺滑曲线:相邻点中点为锚、点本身为控制点的二次贝塞尔(手写感,无折角) */
export function smoothPath(pts) {
  if (!pts || !pts.length) return '';
  const r = (v) => Math.round(v * 10) / 10;
  const [x0, y0] = pts[0];
  if (pts.length === 1) return 'M' + r(x0) + ',' + r(y0) + ' l0.1,0';
  if (pts.length === 2) return 'M' + r(x0) + ',' + r(y0) + ' L' + r(pts[1][0]) + ',' + r(pts[1][1]);
  let d = 'M' + r(x0) + ',' + r(y0);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ' Q' + r(x) + ',' + r(y) + ' ' + r((x + nx) / 2) + ',' + r((y + ny) / 2);
  }
  const last = pts[pts.length - 1];
  return d + ' L' + r(last[0]) + ',' + r(last[1]);
}

/** 清洗一份存档(坏数据/未知 id/超长笔迹一律丢弃或截断) */
export function cleanPortfolio(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ROUND_IDS) {
    const e = raw[id];
    if (!e || !Array.isArray(e.strokes)) continue;
    const strokes = e.strokes
      .filter((d) => typeof d === 'string' && /^M[-\d.]/.test(d))
      .slice(0, MAX_STROKES)
      .map((d) => (d.length > MAX_D_CHARS ? d.slice(0, MAX_D_CHARS).replace(/\s[^\s]*$/, '') : d));
    out[id] = { strokes, at: Number(e.at) || 0 };
  }
  return out;
}

/** 收进一幅;同一幅重画(重走剧情)以最新一次为准 */
export function addDrawing(raw, id, strokes, now = Date.now()) {
  const book = cleanPortfolio(raw);
  if (!ROUND_IDS.includes(id)) return book;
  book[id] = cleanPortfolio({ [id]: { strokes: strokes || [], at: now } })[id];
  return book;
}

/** 写入 ctx.store(键 portfolio);调用方包 try/catch */
export function savePortfolioDrawing(store, id, strokes) {
  store.setJson('portfolio', addDrawing(store.json('portfolio', {}), id, strokes));
}

/** 作品集里有几幅(用于菜单徽标/结局后指引) */
export function portfolioCount(raw) {
  return Object.keys(cleanPortfolio(raw)).length;
}
