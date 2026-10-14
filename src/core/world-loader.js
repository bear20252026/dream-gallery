// world-loader.js — 世界模块加载链(2026-09-24 自 main.js 下沉,热点减负)
// 2026-09-24 主人令「异步渐进加载」:拆成 核心链 + 后台链 两段。
//   核心链 = 出生点可见 + 门禁剧情 + 玩家/渲染必需,串行加载完才揭幕进图;
//   后台链 = 远区山巅深处/深剧情模块(永恒厅/飞舟/星球/回忆层/终章等),
//            核心链完成后立即在后台按原相对顺序补载,**不阻塞进图**。
// 按字面量 import thunk 逐个加载(Vite 仍逐个切包)。
// ⚠️ 顺序即依赖(顶层 ctx 副作用):后台链内部保持原相对顺序。
// ⚠️ **planets.js(星球世界)必须在核心链**:它顶层创建 worldManager 世界注册表
//    (scene-manager initSceneManager + 石门传送垫 loadPortalPad 都在其顶层),
//    boot-check 断言 ctx.scene.worldManager——延后会让自检假报缺项(2026-09-24 探针实测踩坑)。
//    「石门消失」教训的本质也是它:石门/星门传送垫在 planets.js 顶层注册。
// 漏载后果是静默的(2026-09-06「石门消失」= 漏载 planets.js),启动自检见 core/boot-check.js;
// 后台链完成状态挂 window.__deferredWorldReady 供探针/诊断读取。

import { isShelved as isShelvedLegacy } from '../shared/legacy.mjs';
import { runChain } from './world-chain.mjs';

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
  ['星球世界', () => import('../kunlun/planets.js')],
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
  ['第6场国王', () => import('../kunlun/scene6-king.js')],
  ['第7场虚荣', () => import('../kunlun/scene7-vanity.js')],
  ['第7场酒鬼', () => import('../kunlun/scene7-tippler.js')],
  ['第8-9场商人/点灯人/地理学家', () => import('../kunlun/late-planets.js')],
  ['回忆层', () => import('../kunlun/scene3-memory.js')],
  ['重置视角', () => import('../kunlun/resetview.js')],
  ['放下', () => import('../kunlun/letgo.js')],
  ['终章', () => import('../kunlun/finale.js')],
];

// 链的执行与结论都在 core/world-chain.mjs(可单测的纯逻辑);本文件只负责"用什么加载、结论挂到哪儿"。
// 三条对外契约:
//   window.__worldPhase        字符串,给探针/调试看进度(M-13 之前它是唯一读数,现在仍是,但不再是结论)
//   window.__worldStatus       **结构化**结论 {tag,status,loaded[],failed[],skipped[]}(2026-10-14 新增)
//   window.__deferredWorldReady 后台链的 Promise,**resolve 值就是这个结构化结论**(以前 resolve 的是 undefined)
function setPhase(text) {
  try {
    window.__worldPhase = text;
  } catch (e) {
    /* node 下单测跑到这里没有 window */
  }
}
function setStatus(res) {
  try {
    window.__worldStatus = res;
  } catch (e) {
    /* 同上 */
  }
}

async function loadChain(list, tag, fatal) {
  setStatus({ tag, status: 'running', loaded: [], failed: [], skipped: [] });
  return runChain(list, {
    tag,
    fatal,
    load: (label, thunk) => thunk(),
    isShelved: isShelvedLegacy,
    onPhase: setPhase,
    onFail: (label, e) => {
      console.error('[startWorld] ' + tag + ' ' + label + ' 加载失败:', e.message);
      if (window.__reportError)
        window.__reportError('boot', 'startWorld 模块失败: ' + label + ' ' + e.message);
    },
  });
}

/** 串行加载核心链(阻塞揭幕) → 返回前把后台链挂到 window.__deferredWorldReady 不阻塞地跑 */
export async function loadWorldModules() {
  await loadChain(WORLD_MODULES, '核心', true);
  window.__deferredWorldReady = loadChain(WORLD_MODULES_DEFERRED, '后台', false).then((res) => {
    setStatus(res);
    // 「完成」这个词以后只在真的没有失败时说;有失败就点名失败项,不再让链尾把失败洗掉。
    setPhase(res.failed.length ? '后台:降级:' + res.failed.join(',') : '后台:完成');
    return res;
  });
}
