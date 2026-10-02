// ui/story-compass.js — 剧情罗盘:常驻目标条(2026-09-30,照原神任务指引定式)
// 原神怎么解决的(联网取证):
//   ① 追踪一个目标 → 地图上钉标记 + **世界里一道黄色光柱**(距离 ≥50m 才出现,
//      走近自动撤,交给近距离线索:NPC 头顶感叹号 / 物件闪光);
//   ② 屏幕侧常驻**任务追踪栏**:任务名 + **实时距离** + 方向指引;
//   ③ 一步一目标,只追踪一个(多了就乱)。
// 我们此前散点式:信标只在部分场景有、toast 一闪而过、任务册要主动打开 —— 玩家
// 在 3D 里始终缺一个「我现在该去哪 + 多远 + 往哪转」的常驻读数。本模块补②④:
//   - 目标点由剧情模块注册(ctx.ui.storyTarget),坑位单一,谁注册谁撤;
//   - 10Hz 刷新距离与方向指针,指针 0° = 正前方,负角=右偏、正角=左偏;
//   - 到点(≤1.8m)显示行动提示并隐去指针,避免贴脸还在转。
import { guideBearing } from '../shared/journey-guidance.mjs';
import { tt } from '../shared/story-text.mjs';

export function mountStoryCompass(ctx) {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = 'storyCompass';
  // 位置:屏幕左中(原神同侧),避开左上任务卡、右上小地图、右中坐标栏、底部按钮
  el.style.cssText =
    'position:fixed;left:14px;top:172px;z-index:58;pointer-events:auto;' +
    'display:none;align-items:center;gap:9px;' +
    'background:rgba(22,15,20,0.82);border:1px solid rgba(255,214,170,0.32);' +
    'border-radius:10px;padding:8px 12px;color:#ffe2c4;' +
    'font:12px/1.5 inherit;letter-spacing:1px;' +
    'text-shadow:0 1px 2px rgba(0,0,0,.8);user-select:none;backdrop-filter:blur(3px);max-width:230px';

  const arrow = document.createElement('div');
  arrow.textContent = '↑';
  arrow.style.cssText =
    'font-size:16px;line-height:16px;color:#ffd88a;text-shadow:0 0 8px rgba(255,200,100,.8);' +
    'transform-origin:50% 50%;transition:transform .18s linear';
  const txt = document.createElement('div');
  txt.style.cssText = 'flex:1;min-width:0';
  const label = document.createElement('div');
  label.style.cssText = 'opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  const dist = document.createElement('div');
  dist.style.cssText = 'opacity:.62;font-size:11px;font-variant-numeric:tabular-nums';
  txt.append(label, dist);
  const look = document.createElement('button');
  look.type = 'button';
  look.dataset.journeyAction = 'face-target';
  look.style.cssText =
    'min-height:44px;padding:8px 12px;border:1px solid #b49561;border-radius:20px;background:#58482c;color:#fff0cc;font:inherit;cursor:pointer';
  look.onclick = () => ctx.ui.journey?.lookAtGoal();
  el.append(arrow, txt, look);
  document.body.appendChild(el);
  ctx.overlay.register(el, { touchOnly: true, closeOnOutside: false });

  let target = null;
  /** 剧情模块注册当前目标;{world,x,z,en,zh};传 null 撤销 */
  function setTarget(t) {
    target = t || null;
  }

  const zh = () => (document.body && document.body.dataset.scriptLang) !== 'en';
  let acc = 0;
  let lastKey = '';
  ctx.onTick((dt) => {
    acc += dt || 0;
    if (acc < 0.1) return; // 10Hz
    acc = 0;
    const pl = ctx.player && ctx.player.pl;
    const active = ctx.scene.activeWorld || 'main';
    if (!pl || !target || target.world !== active) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    if (ctx.ui.dialogOpen?.() || ctx.overlay.anyOpen()) {
      el.style.display = 'none';
      return;
    }
    const dx = target.x - pl.p.x,
      dz = target.z - pl.p.z;
    const d = Math.hypot(dx, dz);
    el.style.display = 'flex';
    const quest = document.getElementById('questHud');
    if (quest)
      el.style.top = Math.min(quest.getBoundingClientRect().bottom + 12, innerHeight - 210) + 'px';
    // 到点:隐指针,只留「就在眼前」
    if (d <= 1.8) {
      arrow.style.opacity = '0';
      dist.textContent = tt(
        ctx.ui.journey?.state()
          ? { zh: '已到目标 · E 观察', en: 'At the target · E to observe' }
          : { zh: '已到目标 · 跟随剧情提示', en: 'At the target · follow the story prompt' }
      );
    } else {
      arrow.style.opacity = '1';
      const bearing = guideBearing(pl, target);
      const directions = {
        forward: { zh: '向前走', en: 'Walk forward' },
        left: { zh: '向左转', en: 'Turn left' },
        right: { zh: '向右转', en: 'Turn right' },
        behind: { zh: '转身寻找', en: 'Turn around' },
      };
      dist.textContent = tt(directions[bearing.direction]) + ' · ' + Math.round(d) + ' m';
      // 目标所需 yaw(前方向量 = (-sin y, -cos y))与当前朝向之差
      const want = Math.atan2(-dx, -dz);
      let rel = want - (pl.y || 0);
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      // yaw 增大=向左(俯视逆时针),CSS 正角=顺时针 → 取反
      arrow.style.transform = 'rotate(' + (-(rel * 180) / Math.PI).toFixed(0) + 'deg)';
    }
    look.textContent = tt({ zh: '看向目标', en: 'Face target' });
    const s = zh() ? target.zh : target.en;
    const key = s + '|' + Math.round(d);
    if (key !== lastKey) {
      lastKey = key;
      label.textContent = s;
    }
  });

  return { setTarget: setTarget, el: el };
}
