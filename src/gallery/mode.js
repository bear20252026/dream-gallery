// mode.js — 展示区模式系统:普通模式(默认)/特殊模式
// 规则(2026-07-25 主人定):
//   普通:图库照片/视频不上墙(演示照片与本人上传除外)、原有 3D 图案(火星/木星/地球/卷轴等)的外链删除、
//        自定义链接可挂载到这些原图案上(跳转复活),也可新建十种链接模型;特殊模式自定义链接只能建新模型,不挂原图案
//   特殊:现状全展示(演示照片只留后台,不上墙)
// 所有链接跳转均为镶嵌式(openPanel,带"返回画廊"退出键);音乐入口不动;滚动古文照常滚动
import * as THREE from 'three';
import { ctx } from '../ctx.js';
const { s, iG } = ctx;

// 可挂载自定义链接的原有 3D 图案(普通模式)
const MOUNTABLE = {
  isLink2: '月球',
  isLink3: '滚动古文',
  isLink4: '墨韵文档',
  isLink5: '火星',
  isLink6: '木星',
  isLink7: '地球',
  isLink8: '全息档案',
  isLink9: '翠玉',
  isLink10: '福字',
  isLink11: '雅集',
  isLink12: '文档金库',
  isLink13: '祥云文档',
  isGarden: '秘密花园',
};
ctx.mode.MOUNTABLE_ICONS = MOUNTABLE;
// 东墙新建链接模型锚点(后台链接:情书卷轴下方排开)
const CL_BASE = { x: 15.7, z: 14.2 };

let linkModels = [];
// 链接实体索引:key → { g, sig }(2026-10-11 DG-GPU-001)
// 每 60 秒的 refreshMode→applyMode→renderCustomLinks 原是"全删全建":旧组的 Geometry/
// MeshStandardMaterial/名牌 canvas+CanvasTexture/SpriteMaterial 一个都不释放,显存随页面存活
// 时长线性增长(手机端最终可触发 webglcontextlost)。现在按链接 id diff:未变的不删不建,
// 移除的才 dispose,新增的才 spawn。
const linkIndex = new Map();
// 轻提示统一入口改为事件驱动(阶段1,2026-08-27):emit 'ui:toast',
// 由 core/toast-system 订阅渲染。全站 ctx.ui.modeToast(...) / ctx.modeToast(...) 调用经此转发,零改动。
ctx.ui.modeToast = (msg, duration) => {
  ctx.events.emit('ui:toast', { text: msg, duration: duration || 2200 });
};

// 每幅画的可见性规则(2026-07-25 主人修订):
//   普通模式 = 只呈现画框:图库照片/视频的**框全部保留**,但图库内容不加载(texAllowed 拦截,显示占位)
//   演示照片:只普通模式上墙(特殊模式反而只留后台) | 本人上传:两模式可见 | 他人上传:任何模式都隐藏
// 每幅画的可见性规则(2026-07-27 主人终版):
//   普通模式 = 图库「框留下,照片拿掉」:白卡空框保留作装饰/待新照换芯,不再挂灰壳占位
//   演示照片:只普通模式上墙(特殊模式反而只留后台) | 本人上传:两模式可见 | 他人上传:任何模式都隐藏
//   新上传照片普通模式下优先「换芯」空框(见 paintings.js hangOne)
//   (旧规则 2026-07-25:图库框保留+内容不加载的"千面空镜"灰壳,已废止)
import { P, V, LINKS } from '../../data.js';
import { hotBegin, hotEnd } from '../hot.js';
import * as MR from '../shared/mediarules.mjs'; // 可见性决策表单一源(服务端 canServeMedia 同表,2026-07-28 深化④)
import { getGameState } from '../core/game-state.js'; // 阶段4:mode 运行期状态写路径收归 gameState.set(写回经 set 陷阱发事件)
import { canvasTexture } from '../shared/canvas-texture.js';
import { disposeObject3D } from '../shared/dispose-object3d.mjs'; // 统一资源释放(2026-10-11 DG-GPU-001)
const bag = hotBegin('mode');
const LIB = new Set(P.concat(V));
// 内容面显隐(hangOn 固定子序:0框 1碰撞 2白卡 3内容 4镜纹);empty 标记供点击路由跳过空框
function setContent(g, on) {
  const cm = g.children[3];
  if (cm) cm.visible = on;
  g.userData.empty = !on;
}
function paintInputs(g) {
  const src = g.userData.src,
    name = (src || '').split('/').pop();
  return {
    mode: ctx.mode.siteMode,
    src,
    isDemo: (ctx.mode.demoPhotos || []).includes(name),
    isMine: (ctx.mode.myUploads || []).includes(name),
    isLib: LIB.has(src),
  };
}
function applyPaintMode() {
  for (const g of ctx.gallery.paintGroups || []) {
    const d = MR.wallDecision(paintInputs(g)); // 决策表:演示/本人/图库/他人 → 整框+内容面
    g.visible = d.visible;
    setContent(g, d.content);
  }
}
ctx.mode.applyPaintMode = applyPaintMode;

// 纹理门禁(普通模式只放行演示/本人上传,与决策表 content 一致)
function applyTexGate() {
  ctx.mode.texAllowed =
    ctx.mode.siteMode === 'normal'
      ? (url) => {
          const n = (url || '').split('/').pop();
          return MR.contentAllowed({
            mode: 'normal',
            isDemo: (ctx.mode.demoPhotos || []).includes(n),
            isMine: (ctx.mode.myUploads || []).includes(n),
            isLib: false,
          });
        }
      : null;
}
ctx.mode.texAllowed = null;

// 挂载表:icon -> 自定义链接(仅普通模式生效)
function mountMap() {
  const m = {};
  for (const l of ctx.mode.customLinks || []) if (l.icon) m[l.icon] = l;
  return m;
}

// 链接点击埋点:每一次点击都上报完整身份(记录仅后台可见,普通用户无感知)
let _fpCache = null;
function trackClick(link, url) {
  try {
    if (!_fpCache) {
      _fpCache = {
        scr: screen.width + 'x' + screen.height + 'x' + (window.devicePixelRatio || 1),
        avail: screen.availWidth + 'x' + screen.availHeight,
        tz: new Date().getTimezoneOffset(),
        lang: navigator.language || '',
        langs: (navigator.languages || []).join(','),
        platform: navigator.platform || '',
        cores: navigator.hardwareConcurrency || 0,
        mem: navigator.deviceMemory || 0,
        touch: 'ontouchstart' in window,
        maxTouch: navigator.maxTouchPoints || 0,
      };
      try {
        const cv = document.createElement('canvas');
        cv.width = 200;
        cv.height = 30;
        const cx = cv.getContext('2d');
        cx.textBaseline = 'top';
        cx.font = '14px Arial';
        cx.fillStyle = '#f60';
        cx.fillRect(0, 0, 100, 30);
        cx.fillStyle = '#069';
        cx.fillText('B612·fp', 2, 4);
        cx.strokeStyle = 'rgba(120,60,200,0.7)';
        cx.arc(150, 15, 10, 0, Math.PI * 2);
        cx.stroke();
        const durl = cv.toDataURL();
        let h = 0;
        for (let i = 0; i < durl.length; i++) {
          h = ((h << 5) - h + durl.charCodeAt(i)) | 0;
        }
        _fpCache.canvas = (h >>> 0).toString(16);
      } catch (e) {}
    }
    const pos = ctx.player.pl
      ? {
          x: +ctx.player.pl.p.x.toFixed(1),
          y: +ctx.player.pl.p.y.toFixed(1),
          z: +ctx.player.pl.p.z.toFixed(1),
        }
      : null;
    const body = JSON.stringify({ link, url, pos, fp: _fpCache });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/click', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(function () {});
    }
  } catch (e) {}
}
ctx.mode.trackClick = trackClick;

// 链接门禁(paintings.js 点击路由调用):返回 true = 已接管(路由不再打开原链接)
function linkGuard(linkKey) {
  trackClick(linkKey, LINKS[linkKey] || '');
  if (ctx.mode.siteMode !== 'normal') return false; // 特殊模式:原链接全部可见
  if (linkKey === 'isLink') {
    // 情书卷轴 → 《元素共鸣准则》说明书
    window.openPanel('guide.html', '元素共鸣准则');
    return true;
  }
  if (MOUNTABLE[linkKey]) {
    // 普通模式:原外链已删除;挂了自定义链接则跳自定义,否则模块沉寂(不跳不提示)
    const mounted = mountMap()[linkKey];
    if (mounted) window.openPanel(mounted.url, mounted.name);
    return true;
  }
  return false;
}
ctx.mode.linkGuard = linkGuard;

// ===== 十种链接模型(新建后直接出现在眼前,点击镶嵌跳转)=====
const MODEL_TYPES = {
  sphere: { name: '水晶球', geo: () => new THREE.SphereGeometry(0.35, 24, 18), color: '#66ccff' },
  cube: { name: '立方晶', geo: () => new THREE.BoxGeometry(0.5, 0.5, 0.5), color: '#ffaa66' },
  cone: { name: '金字塔', geo: () => new THREE.ConeGeometry(0.35, 0.7, 4), color: '#ffd700' },
  octa: { name: '星钻', geo: () => new THREE.OctahedronGeometry(0.4, 0), color: '#ff88cc' },
  torus: { name: '光环', geo: () => new THREE.TorusGeometry(0.32, 0.12, 12, 24), color: '#88ffcc' },
  cylinder: {
    name: '玉柱',
    geo: () => new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16),
    color: '#aaddff',
  },
  icosa: { name: '宝石', geo: () => new THREE.IcosahedronGeometry(0.4, 0), color: '#cc99ff' },
  knot: {
    name: '如意结',
    geo: () => new THREE.TorusKnotGeometry(0.26, 0.09, 48, 8),
    color: '#ff9966',
  },
  capsule: {
    name: '胶囊',
    geo: () => new THREE.CapsuleGeometry(0.22, 0.35, 4, 12),
    color: '#99ff99',
  },
  dodeca: { name: '多面晶', geo: () => new THREE.DodecahedronGeometry(0.4, 0), color: '#ffbbee' },
};
ctx.mode.LINK_MODEL_TYPES = MODEL_TYPES;

// 文字牌(名称 + 点击可跳转)
function makeLabel(text, sub, color) {
  // 画布样板统一在 shared/canvas-texture.js(B1 整改)
  const tex = canvasTexture(256, 96, (cx) => {
    cx.fillStyle = 'rgba(18,18,30,0.6)';
    if (cx.roundRect) {
      cx.beginPath();
      cx.roundRect(8, 8, 240, 80, 16);
      cx.fill();
    } else cx.fillRect(8, 8, 240, 80, 16);
    cx.fillStyle = color || '#ffffff';
    cx.font = 'bold 28px Arial';
    cx.textAlign = 'center';
    cx.fillText(text, 128, 44);
    cx.font = '20px Arial';
    cx.fillStyle = 'rgba(255,233,168,0.85)';
    cx.fillText(sub || '🔗 点击可跳转', 128, 74);
  });
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sp.scale.set(1.1, 0.41, 1);
  return sp;
}

// 创建一个链接模型组(模型+名牌),挂在指定位置
function spawnLinkModel(type, name, url, pos, mine) {
  const t = MODEL_TYPES[type] || MODEL_TYPES.sphere;
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    t.geo(),
    new THREE.MeshStandardMaterial({
      color: t.color,
      emissive: t.color,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.2,
    })
  );
  g.add(mesh);
  const label = makeLabel(
    name,
    mine ? '我的链接 · 点击可跳转' : undefined,
    mine ? '#c9ffe2' : '#dceaff'
  );
  label.position.y = 0.75;
  g.add(label);
  g.position.set(pos.x, pos.y, pos.z);
  g.userData = { isCustomLink: true, customUrl: url, linkName: name, spin: true };
  s.add(g);
  iG.push(g);
  linkModels.push(g);
  return g;
}
ctx.mode.spawnLinkModel = spawnLinkModel;

// 模型自转动画(注册一次)
{
  const t0 = performance.now();
  ctx.onTick(function () {
    const t = (performance.now() - t0) / 1000;
    for (const g of linkModels) {
      if (g.userData.spin) g.rotation.y = t * 0.8;
    }
  });
}

// 拆掉一个链接实体:摘出场景/交互表/索引,并**真正释放**它的 GPU 资源
// (Sprite 的名牌几何是 three 的模块级共享单例,disposeObject3D 内置保护不会碰它——照它做会全站 Sprite 消失)
function destroyLinkModel(g) {
  if (!g) return;
  s.remove(g);
  const ix = iG.indexOf(g);
  if (ix >= 0) iG.splice(ix, 1);
  const im = linkModels.indexOf(g);
  if (im >= 0) linkModels.splice(im, 1);
  for (const [k, rec] of linkIndex) if (rec.g === g) linkIndex.delete(k);
  disposeObject3D(g);
}

// 链接身份:优先服务端下发的 id(后台链接与访客链接都带),缺失退回「类型+下标」稳定串
function linkKeyOf(kind, l, i) {
  const id = l && l.id != null && l.id !== '' ? String(l.id) : kind + '-' + i;
  return kind + ':' + id;
}
// 需要重画名牌的改动(改名/换模型/换归属)= 签名变;只改位置或跳转地址不必重建
function linkSigOf(l, mine) {
  return (l.model || 'sphere') + '|' + (l.name || '') + '|' + (mine ? 1 : 0);
}

// 渲染全部链接实体(模式刷新时按链接 id 增量对齐,不再是"全删全建")
function renderCustomLinks() {
  const wanted = new Map(); // key → { g 应有的参数 }
  let row = 0;
  let ci = 0;
  for (const l of ctx.mode.customLinks || []) {
    if (l.icon) continue; // 挂原图案的:普通模式由 linkGuard 接管,特殊模式不显示
    // 新建模型:后台链接在东墙排开
    wanted.set(linkKeyOf('c', l, ci++), {
      l,
      mine: false,
      pos: { x: CL_BASE.x, y: 2.0, z: CL_BASE.z - row++ * 1.4 },
    });
  }
  let mi = 0;
  for (const l of ctx.mode.myLinks || []) {
    // 访客自己的链接:直接出现在他当时站的位置前方
    const p =
      l.pos && l.pos.x !== undefined ? l.pos : { x: CL_BASE.x, y: 2.0, z: CL_BASE.z - row++ * 1.4 };
    wanted.set(linkKeyOf('m', l, mi++), { l, mine: true, pos: p });
  }
  // 1) 本轮不再存在的链接 → 摘除并释放
  for (const [k, rec] of Array.from(linkIndex)) {
    if (wanted.has(k)) continue;
    linkIndex.delete(k);
    destroyLinkModel(rec.g);
  }
  // 2) 已存在且签名未变 → 原地保留(只同步位置与跳转地址);签名变了 → 拆了重建
  for (const [k, w] of wanted) {
    const sig = linkSigOf(w.l, w.mine);
    const rec = linkIndex.get(k);
    if (rec && rec.sig === sig) {
      rec.g.position.set(w.pos.x, w.pos.y, w.pos.z);
      rec.g.userData.customUrl = w.l.url;
      rec.g.userData.linkName = w.l.name;
      continue;
    }
    if (rec) {
      linkIndex.delete(k);
      destroyLinkModel(rec.g);
    }
    const g = spawnLinkModel(w.l.model || 'sphere', w.l.name, w.l.url, w.pos, w.mine);
    linkIndex.set(k, { g, sig });
  }
}

// 应用模式到所有视觉面
function applyMode() {
  applyPaintMode();
  applyTexGate();
  // 卷轴文案
  if (ctx.media.scrollLink && ctx.media.scrollLink.redraw) {
    ctx.media.scrollLink.redraw('元素共鸣准则', '点击阅读'); // 特殊模式已删(2026-09-06),恒普通模式文案
  }
  // 坐标绿条:?debug 才显示(特殊模式已删)
  const posEl = document.getElementById('posD');
  if (posEl) posEl.style.display = location.search.includes('debug') ? 'block' : 'none';
  renderCustomLinks();
}
ctx.mode.applyMode = applyMode;

// 拉取配置并应用;每 60s 轮询一次(模式变更 ≤1 分钟生效)
async function refreshMode() {
  try {
    const r = await fetch('/api/siteconfig');
    const d = await r.json();
    // 阶段4:运行期状态写路径收归 gameState.set(写回 ctx.mode + 发 mode:changed 事件,读者零改动)。
    // bindNamespace('mode',...) 在 state-system.init 注册,refreshMode 经网络异步返回,晚于启动,故写回已就绪。
    const gs = getGameState();
    gs.set('siteMode', d.mode === 'special' ? 'special' : 'normal');
    gs.set('customLinks', d.customLinks || []);
    gs.set('demoPhotos', d.demoPhotos || []);
    gs.set('myUploads', d.myUploads || []);
    gs.set('myUploadTokens', d.myUploadTokens || {}); // 本人上传媒体令牌(loadTexCapped 拼 ?mt= 过图片代理)
    gs.set('myLinks', d.myLinks || []);
    gs.set('myCaptions', d.captions || {});
    // 刷新后重新挂墙的本人上传:把 AI 配文写回画框(否则只剩通用文案"新上传的照片")
    for (const g of ctx.gallery.paintGroups || []) {
      const n = (g.userData.src || '').split('/').pop();
      if (ctx.mode.myCaptions[n]) g.userData.aiDesc = ctx.mode.myCaptions[n];
    }
    applyMode();
  } catch (e) {
    /* 失败保持现状 */
  }
}
refreshMode();
setInterval(refreshMode, 60000);

ctx.mode.renderCustomLinks = renderCustomLinks; // 2026-09-20 收编登记册(mode 域)
ctx.mode.applyTexGate = applyTexGate;
ctx.mode.refreshMode = refreshMode; // 命名空间注册(扁平写已软冻结)

// HMR 收口(2026-10-11 DG-GPU-001):60 秒轮询 spawn 的链接实体诞生在 hotEnd 之后,
// 不在 bag.objs 的捕获窗口里 → 热替换必须自己拆干净,否则旧世代的链接留在场景里。
bag.custom.push(function () {
  for (const rec of Array.from(linkIndex.values())) destroyLinkModel(rec.g);
  linkIndex.clear();
  linkModels.length = 0;
});

hotEnd('mode');
if (import.meta.hot) import.meta.hot.accept();
