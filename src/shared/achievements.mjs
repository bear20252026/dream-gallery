// achievements.mjs — 成就徽章的**纯逻辑核**(C4,2026-11-12 新功能)
//
// 设计依据:ROADMAP-需求对齐清单 第五节修正「成就系统=10 项」——
//   六灵蕴 6 项 + 六合归位 + 天空的访客 + 云端的归宿 + 补天者。
// 本文件只做三件事:定义 10 枚徽章、按存档快照判定是否达成、算出新解锁的差集。
// **零 ctx / 零 DOM / 零存档写入**:判定输入是一份普通快照对象,便于单测直接喂形状
// (与 ending-logic.mjs / planet-logic.mjs 同一族口径:纯核可单测,装配层才碰 ctx)。
//
// ⚠️ 徽章只读既有进度,绝不新增进度来源:达成条件全部来自已有存档键
//   (spiritsKeys / spiritsDone / arkFlew / eternalPicks / skyMs),
//   所以老玩家的既有进度会**立即**体现为已达成,不需要重新玩一遍。

// 六灵蕴 key 顺序与 store-api.js 的 SPIRIT_ORDER 一致(徽章按此序展示)
export const SPIRIT_KEYS = ['sprout', 'flame', 'leaf', 'snow', 'dawn', 'dusk'];

// 10 枚徽章。group 用于分组展示;spirit 项带 key 与配色(与 spirits.js 的灵蕴色一致)。
// 2026-11-12 世界观统一:六枚灵蕴徽章的名字改用**星球名**(与罗盘/任务册同源,
// planet-logic 的 PLANETS 已把 name 覆盖成「国王之星」等),不再用「春生之芽」这套昆仑语汇;
// 四项里程碑 likewise:六合归位→六颗星齐、天空的访客→星际旅人、云端的归宿→画廊的主人、补天者→星图已亮。
// ⚠️ id / key / group / color 一律不变 —— id 是存档 achievementsSeen 的键,改了老玩家已通报记录会失效。
export const ACHIEVEMENTS = [
  { id: 'spirit-sprout', group: 'spirits', key: 'sprout', color: '#7ddb7a', name: '国王之星', en: 'The King', desc: '点亮 325：遇见国王', descEn: 'Lit 325: met the king' },
  { id: 'spirit-flame', group: 'spirits', key: 'flame', color: '#ff5a4a', name: '虚荣之星', en: 'The Vain Man', desc: '点亮 326：遇见爱虚荣的人', descEn: 'Lit 326: met the vain man' },
  { id: 'spirit-leaf', group: 'spirits', key: 'leaf', color: '#e8a03c', name: '酒鬼之星', en: 'The Tippler', desc: '点亮 327：遇见酒鬼', descEn: 'Lit 327: met the tippler' },
  { id: 'spirit-snow', group: 'spirits', key: 'snow', color: '#dfeaf5', name: '商人之星', en: 'The Businessman', desc: '点亮 328：遇见商人', descEn: 'Lit 328: met the businessman' },
  { id: 'spirit-dawn', group: 'spirits', key: 'dawn', color: '#7cc8e8', name: '点灯人之星', en: 'The Lamplighter', desc: '点亮 329：遇见点灯人', descEn: 'Lit 329: met the lamplighter' },
  { id: 'spirit-dusk', group: 'spirits', key: 'dusk', color: '#e8c890', name: '地理学家之星', en: 'The Geographer', desc: '点亮 330：遇见地理学家', descEn: 'Lit 330: met the geographer' },
  { id: 'six-united', group: 'milestone', color: '#ffd98a', name: '六颗星齐', en: 'Six Stars', desc: '六颗星球都已点亮', descEn: 'All six stars are lit' },
  { id: 'sky-visitor', group: 'milestone', color: '#c9a2ff', name: '星际旅人', en: 'Star Traveller', desc: '完成第一次星际飞行', descEn: 'Completed the first flight between stars' },
  { id: 'cloud-home', group: 'milestone', color: '#8fe3d0', name: '画廊的主人', en: 'Keeper of the Gallery', desc: '为你的画廊挑选过作品', descEn: 'Curated works for your gallery' },
  { id: 'sky-mender', group: 'milestone', color: '#ffe9b0', name: '星图已亮', en: 'The Map Is Lit', desc: '把整片星图点亮（100%）', descEn: 'Lit the whole star map (100%)' },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** 按 id 取徽章定义;未知 id 返回 null(调用方据此忽略脏数据) */
export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

/**
 * 判定输入的存档快照形状(精确声明,不用裸 object —— 项目判据 types-param-bag-shapes 钉死这一族)。
 * 字段全部可选:调用方可以只给它关心的那几项,缺的按"未达成"处理。
 * @typedef {Object} AchievementSnapshot
 * @property {string[]} [spiritsKeys] 已拾灵蕴 key(存档 spiritsKeys)
 * @property {boolean} [spiritsDone] 六灵蕴终章已触发(老档兼容口径)
 * @property {boolean} [arkFlew] 飞舟首飞完成
 * @property {string[]} [eternalPicks] 展厅选片作品名
 * @property {number|string} [skyMs] 天穹里程碑档位(存档 num 键读回可能是字符串)
 */

/**
 * 归一存档快照:只取判定需要的字段,脏数据一律退到"未达成"侧(fail-closed,不凭空发徽章)。
 * @param {AchievementSnapshot} raw 存档快照(字段可缺)
 */
export function normalizeSnapshot(raw) {
  const r = raw && typeof raw === 'object' ? raw : /** @type {AchievementSnapshot} */ ({});
  const keys = Array.isArray(r.spiritsKeys) ? r.spiritsKeys.filter((k) => SPIRIT_KEYS.includes(k)) : [];
  const picks = Array.isArray(r.eternalPicks) ? r.eternalPicks : [];
  const sky = Number(r.skyMs);
  return {
    spirits: [...new Set(keys)],
    spiritsDone: !!r.spiritsDone,
    arkFlew: !!r.arkFlew,
    pickCount: picks.length,
    skyMs: Number.isFinite(sky) ? sky : 0,
  };
}

/**
 * 判定:返回**当前应达成**的徽章 id 数组(顺序 = ACHIEVEMENTS 定义序)。
 * 六合归位取「六颗齐」或「终章已触发」二者之一(老档可能只有终章标记)。
 */
export function earnedIds(raw) {
  const s = normalizeSnapshot(raw);
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (a.group === 'spirits') {
      if (s.spirits.includes(a.key)) out.push(a.id);
      continue;
    }
    if (a.id === 'six-united' && (s.spirits.length >= SPIRIT_KEYS.length || s.spiritsDone)) out.push(a.id);
    else if (a.id === 'sky-visitor' && s.arkFlew) out.push(a.id);
    else if (a.id === 'cloud-home' && s.pickCount > 0) out.push(a.id);
    else if (a.id === 'sky-mender' && s.skyMs >= 100) out.push(a.id);
  }
  return out;
}

/**
 * 新解锁差集:本次判定达成、但存档里还没记过的。
 * 已记过的脏 id(不在定义表里)会被忽略,不会误判成"新解锁"。
 * @returns {string[]} 新解锁 id(定义序)
 */
export function newlyEarned(raw, recorded) {
  const known = new Set(Array.isArray(recorded) ? recorded.filter((id) => ACHIEVEMENT_IDS.includes(id)) : []);
  return earnedIds(raw).filter((id) => !known.has(id));
}

/** 展示用:把快照折成每枚徽章的 {def, earned} 列表(顺序固定,便于 UI 直接渲染) */
export function achievementView(raw) {
  const got = new Set(earnedIds(raw));
  return ACHIEVEMENTS.map((def) => ({ def, earned: got.has(def.id) }));
}