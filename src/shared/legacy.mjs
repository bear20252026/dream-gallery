// legacy.mjs — 旧玩法「先放一边」开关(2026-10-03 主人令:不删除,暂时搁置)
//
// 游戏聚焦为一个纯粹的《小王子》旅程。以下旧玩法的代码全部保留,只是默认不再加载/不再挡路:
//   昆仑线:答题门、温柔度测试、远方山巅彩蛋、永恒展厅(飞舟/风铃/壁炉/雪窗/重置视角/放下/终章)
//   画廊布景:Yazd 穹顶塔楼群
// 临时恢复:网址加 ?legacy=1(会记住);?legacy=0 关闭并清除记忆。
import { storeApi } from '../state/store-api.js';

export function legacyOn() {
  try {
    const q = new URLSearchParams(location.search).get('legacy');
    if (q === '1') {
      storeApi.mark('legacy');
      return true;
    }
    if (q === '0') {
      storeApi.unmark('legacy');
      return false;
    }
    return storeApi.flag('legacy');
  } catch (e) {
    return false;
  }
}

/** 世界模块清单里属于旧玩法的**稳定 id**;默认跳过加载。
 *  ⚠️这里存的必须是 id,不是中文标签(第六轮审计 M-10):标签是给人看的显示文字,
 *  改一个字(「远方山巅」→「远山」)就把一条搁置规则静默作废 —— 那个模块会重新开始加载,
 *  而没有任何测试会红。id 与所加载的文件同名,改名要同时动 world-loader 的那一行,改得掉也看得见。 */
export const LEGACY_MODULE_IDS = new Set([
  'quiz', // 温柔度
  'quizgate', // 答题门
  'peaks', // 远方山巅
  'dome-towers', // 塔楼
  'eternal', // 永恒厅
  'ark', // 飞舟
  'windchime', // 风铃
  'fireplace', // 壁炉
  'snowwin', // 雪窗
  'resetview', // 重置视角
  'letgo', // 放下
  'finale', // 终章
]);

/** 这一条模块是不是"被搁置"的旧玩法。规则只在这里定义一次:
 *  加载链(core/world-chain.mjs)用它统计"跳过名单",别在别处再写一遍判定。 */
export function isShelved(entry, on) {
  const keep = on === undefined ? legacyOn() : on;
  return !keep && LEGACY_MODULE_IDS.has(entry && entry.id);
}
