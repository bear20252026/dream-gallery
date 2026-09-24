// world-loader.js — 世界模块加载链(2026-09-24 自 main.js 下沉,热点减负)
// 按原 import 顺序逐个动态加载全部世界模块(字面量 import thunk,Vite 仍逐个切包)。
// 只加载不渲染:加载耗时被开场电影时长整体吸收(2026-09-06 主人定「预加载,只加载不展示」)。
// ⚠️ 顺序即依赖:后面的模块依赖前面模块的构建副作用,顺序不可调换——
//    新增世界模块 = 在 WORLD_MODULES 末尾附近按依赖位置插一行。
// 漏载后果是静默的(2026-09-06「石门消失」= 漏载 planets.js),启动自检见 core/boot-check.js。

/** @type {Array<[string, () => Promise<unknown>]>} [诊断标签, 模块加载 thunk] */
export const WORLD_MODULES = [
  ['场景', () => import('../scene/scene.js')],
  ['媒体', () => import('../scene/media.js')],
  ['牌子', () => import('../gallery/signs.js')],
  ['喷泉', () => import('../gallery/fountains.js')],
  ['标记', () => import('../gallery/markers.js')],
  ['链接', () => import('../gallery/links.js')],
  ['挂画', () => import('../gallery/paintings.js')],
  ['模式', () => import('../gallery/mode.js')],
  ['塔楼', () => import('../gallery/dome-towers.js')],
  ['设置', () => import('../gate/settings.js')],
  ['上传', () => import('../gate/upload.js')],
  ['房屋色', () => import('../gate/housecolor.js')],
  ['温柔度', () => import('../gate/quiz.js')],
  ['沙漠', () => import('../scene/desert.js')],
  ['玩家', () => import('../scene/player.js')],
  ['答题门', () => import('../gate/quizgate.js')],
  ['远方山巅', () => import('../kunlun/peaks.js')],
  ['灵蕴', () => import('../kunlun/spirits.js')],
  ['永恒厅', () => import('../kunlun/eternal.js')],
  ['飞舟', () => import('../kunlun/ark.js')],
  ['风铃', () => import('../kunlun/windchime.js')],
  ['壁炉', () => import('../kunlun/fireplace.js')],
  ['雪窗', () => import('../kunlun/snowwin.js')],
  ['星球世界', () => import('../kunlun/planets.js')],
  ['第6场国王', () => import('../kunlun/scene6-king.js')],
  ['对话', () => import('../kunlun/story-dialogs.js')],
  ['石门', () => import('../gallery/portal.js')],
  ['坠机点', () => import('../gallery/crash-site.js')],
  ['画羊', () => import('../gate/scene2-draw.js')],
  ['书页一', () => import('../gate/scene3-night.js')],
  ['回忆层', () => import('../kunlun/scene3-memory.js')],
  ['重置视角', () => import('../kunlun/resetview.js')],
  ['放下', () => import('../kunlun/letgo.js')],
  ['终章', () => import('../kunlun/finale.js')],
  ['状态机', () => import('../player/states/PlayerStates.js')],
  ['后处理', () => import('../scene/postprocessing.js')],
];

/** 顺序加载全部世界模块;任一失败:记 __worldPhase + beacon 上报后抛出(由 startWorld 兜底重试) */
export async function loadWorldModules() {
  for (const [label, load] of WORLD_MODULES) {
    try {
      window.__worldPhase = label;
      await load();
    } catch (e) {
      window.__worldPhase = '失败:' + label;
      console.error('[startWorld] ' + label + ' 加载失败:', e.message);
      if (window.__reportError)
        window.__reportError('boot', 'startWorld 模块失败: ' + label + ' ' + e.message);
      throw e;
    }
  }
}
