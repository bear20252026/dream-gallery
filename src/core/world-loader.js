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

// 每条 = { id, label, load }。**id 是身份键**(稳定、ASCII、与所加载文件同名),
// label 只用于显示与 `__worldPhase` 字符串(那串有 6 个探针在读,措辞一字不改)。
// 搁置规则按 id 判(shared/legacy.mjs)—— 改 label 不会静默改加载行为。

/** 核心链:进图前必须就绪(串行,阻塞揭幕) @type {Array<{id:string,label:string,load:() => Promise<unknown>}>} */
export const WORLD_MODULES = [
  { id: 'scene', label: '场景', load: () => import('../scene/scene.js') },
  { id: 'media', label: '媒体', load: () => import('../scene/media.js') },
  { id: 'signs', label: '牌子', load: () => import('../gallery/signs.js') },
  { id: 'fountains', label: '喷泉', load: () => import('../gallery/fountains.js') },
  { id: 'markers', label: '标记', load: () => import('../gallery/markers.js') },
  { id: 'links', label: '链接', load: () => import('../gallery/links.js') },
  { id: 'paintings', label: '挂画', load: () => import('../gallery/paintings.js') },
  { id: 'mode', label: '模式', load: () => import('../gallery/mode.js') },
  { id: 'dome-towers', label: '塔楼', load: () => import('../gallery/dome-towers.js') },
  { id: 'settings', label: '设置', load: () => import('../gate/settings.js') },
  { id: 'upload', label: '上传', load: () => import('../gate/upload.js') },
  { id: 'housecolor', label: '房屋色', load: () => import('../gate/housecolor.js') },
  { id: 'quiz', label: '温柔度', load: () => import('../gate/quiz.js') },
  { id: 'desert', label: '沙漠', load: () => import('../scene/desert.js') },
  { id: 'player', label: '玩家', load: () => import('../scene/player.js') },
  { id: 'quizgate', label: '答题门', load: () => import('../gate/quizgate.js') },
  { id: 'peaks', label: '远方山巅', load: () => import('../kunlun/peaks.js') },
  { id: 'spirits', label: '灵蕴', load: () => import('../kunlun/spirits.js') },
  { id: 'planets', label: '星球世界', load: () => import('../kunlun/planets.js') },
  { id: 'story-dialogs', label: '对话', load: () => import('../kunlun/story-dialogs.js') },
  { id: 'portal', label: '石门', load: () => import('../gallery/portal.js') },
  { id: 'crash-site', label: '坠机点', load: () => import('../gallery/crash-site.js') },
  { id: 'scene2-draw', label: '画羊', load: () => import('../gate/scene2-draw.js') },
  { id: 'scene3-night', label: '书页一', load: () => import('../gate/scene3-night.js') },
  { id: 'player-states', label: '状态机', load: () => import('../player/states/PlayerStates.js') },
  { id: 'postprocessing', label: '后处理', load: () => import('../scene/postprocessing.js') },
];

/** 后台链:进图后不阻塞补载(远区/深剧情;保持相对顺序) @type {Array<{id:string,label:string,load:() => Promise<unknown>}>} */
export const WORLD_MODULES_DEFERRED = [
  { id: 'eternal', label: '永恒厅', load: () => import('../kunlun/eternal.js') },
  { id: 'ark', label: '飞舟', load: () => import('../kunlun/ark.js') },
  { id: 'windchime', label: '风铃', load: () => import('../kunlun/windchime.js') },
  { id: 'fireplace', label: '壁炉', load: () => import('../kunlun/fireplace.js') },
  { id: 'snowwin', label: '雪窗', load: () => import('../kunlun/snowwin.js') },
  { id: 'scene6-king', label: '第6场国王', load: () => import('../kunlun/scene6-king.js') },
  { id: 'scene7-vanity', label: '第7场虚荣', load: () => import('../kunlun/scene7-vanity.js') },
  { id: 'scene7-tippler', label: '第7场酒鬼', load: () => import('../kunlun/scene7-tippler.js') },
  {
    id: 'late-planets',
    label: '第8-9场商人/点灯人/地理学家',
    load: () => import('../kunlun/late-planets.js'),
  },
  { id: 'scene3-memory', label: '回忆层', load: () => import('../kunlun/scene3-memory.js') },
  { id: 'resetview', label: '重置视角', load: () => import('../kunlun/resetview.js') },
  { id: 'letgo', label: '放下', load: () => import('../kunlun/letgo.js') },
  { id: 'finale', label: '终章', load: () => import('../kunlun/finale.js') },
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
    load: (entry) => entry.load(),
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
