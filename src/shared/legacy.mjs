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

/** world-loader 里属于旧玩法的模块(按标签);默认跳过加载 */
export const LEGACY_MODULE_LABELS = new Set([
  '温柔度',
  '答题门',
  '远方山巅',
  '塔楼',
  '永恒厅',
  '飞舟',
  '风铃',
  '壁炉',
  '雪窗',
  '重置视角',
  '放下',
  '终章',
]);

/** 过滤加载链:旧玩法关闭时去掉 LEGACY_MODULE_LABELS 里的模块 */
export function activeModules(list, on) {
  const keep = on === undefined ? legacyOn() : on;
  return keep ? list : list.filter((e) => !LEGACY_MODULE_LABELS.has(e[0]));
}
