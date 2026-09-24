// world-loader.js — 世界模块加载链(2026-09-24 自 main.js 下沉,热点减负)
// 2026-09-24 主人令「异步渐进加载」:拆成 核心链 + 后台链 两段。
//   核心链 = 出生点可见 + 门禁剧情 + 玩家/渲染必需,串行加载完才揭幕进图;
//   后台链 = 远区山巅深处/深剧情模块(永恒厅/飞舟/星球/回忆层/终章等),
//            核心链完成后立即在后台按原相对顺序补载,**不阻塞进图**。
// 按字面量 import thunk 逐个加载(Vite 仍逐个切包)。
// ⚠️ 顺序即依赖(顶层 ctx 副作用):后台链内部保持原相对顺序;
//    已核实 core 后段(对话/石门/坠机点/画羊/书页一/状态机/后处理)顶层不读后台链登记
//    (planetsMode/eternalHandlers/eternalTeleport/arkTeleportToPeak/letgoRecall 等零引用)。
// 漏载后果是静默的(2026-09-06「石门消失」= 漏载 planets.js),启动自检见 core/boot-check.js;
// 后台链完成状态挂 window.__deferredWorldReady 供探针/诊断读取。

/** 核心链:进图前必须就绪(串行,阻塞揭幕) @type {Array<[string, () => Promise<unknown>]>} */
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
  ['对话', () => import('../kunlun/story-dialogs.js')],
  ['石门', () => import('../gallery/portal.js')],
  ['坠机点', () => import('../gallery/crash-site.js')],
  ['画羊', () => import('../gate/scene2-draw.js')],
  ['书页一', () => import('../gate/scene3-night.js')],
  ['状态机', () => import('../player/states/PlayerStates.js')],
  ['后处理', () => import('../scene/postprocessing.js')],
];

/** 后台链:进图后不阻塞补载(远区/深剧情;保持相对顺序) @type {Array<[string, () => Promise<unknown>]>} */
export const WORLD_MODULES_DEFERRED = [
  ['永恒厅', () => import('../kunlun/eternal.js')],
  ['飞舟', () => import('../kunlun/ark.js')],
  ['风铃', () => import('../kunlun/windchime.js')],
  ['壁炉', () => import('../kunlun/fireplace.js')],
  ['雪窗', () => import('../kunlun/snowwin.js')],
  ['星球世界', () => import('../kunlun/planets.js')],
  ['第6场国王', () => import('../kunlun/scene6-king.js')],
  ['回忆层', () => import('../kunlun/scene3-memory.js')],
  ['重置视角', () => import('../kunlun/resetview.js')],
  ['放下', () => import('../kunlun/letgo.js')],
  ['终章', () => import('../kunlun/finale.js')],
];

async function loadChain(list, tag, fatal) {
  for (const [label, load] of list) {
    try {
      window.__worldPhase = tag + ':' + label;
      await load();
    } catch (e) {
      window.__worldPhase = tag + ':失败:' + label;
      console.error('[startWorld] ' + tag + ' ' + label + ' 加载失败:', e.message);
      if (window.__reportError)
        window.__reportError('boot', 'startWorld 模块失败: ' + label + ' ' + e.message);
      if (fatal) throw e; // 核心链失败:由 startWorld 兜底重试
      // 后台链失败:世界已进图,记日志后继续加载剩余模块
    }
  }
}

/** 串行加载核心链(阻塞揭幕) → 返回前把后台链挂到 window.__deferredWorldReady 不阻塞地跑 */
export async function loadWorldModules() {
  await loadChain(WORLD_MODULES, '核心', true);
  window.__deferredWorldReady = loadChain(WORLD_MODULES_DEFERRED, '后台', false).then(() => {
    window.__worldPhase = '后台:完成';
  });
}
