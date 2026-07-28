// hot.js — 轻量 HMR 生命周期助手(Vite 热更新红利)
// 用法(模块顶部/底部各一行,零侵入):
//   import {hotBegin,hotEnd} from './hot.js';
//   hotBegin('模块名');
//   ...原有模块代码...
//   hotEnd('模块名');
//   if(import.meta.hot)import.meta.hot.accept();
// Vite 重载该模块时:先按记录销毁旧实例(场景对象/几何/材质/ticker/定时器/DOM/自定义清理),再执行新代码。
// 需要额外清理的(碰撞体/iG 可交互组/全局事件监听等):const bag=hotBegin('x'); bag.custom.push(()=>{...});
// 不适合有玩家状态/物理/长连接的模块(player/desert/media 保持整页刷新)。
import {ctx} from './ctx.js';

const REG = (window.__HMR__ = window.__HMR__ || {});

export function hotBegin(name) {
  // 销毁上一个实例(热替换时)
  if (REG[name]) {
    try { REG[name].dispose(); } catch (e) { console.warn('[hot] 销毁旧实例失败:', name, e); }
    delete REG[name];
  }
  const bag = { objs: [], doms: [], intervals: [], tickers: [], custom: [] };
  REG[name] = bag;
  bag.dispose = () => {
    for (const o of bag.objs) {
      ctx.scene.s && ctx.scene.s.remove(o);
      o.traverse && o.traverse(n => {
        if (n.geometry && n.geometry.dispose) n.geometry.dispose();
        const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
        for (const m of ms) {
          if (m.map && m.map.dispose) m.map.dispose();
          if (m.dispose) m.dispose();
        }
      });
    }
    // ticker 逐个按引用移除(2026-07-25 修复:曾按注册刻度截断,热更新靠前的模块
    // 会把其后所有模块的 ticker 一起杀掉——现在只杀自己注册的)
    for (const fn of bag.tickers) {
      const i = ctx.tickers.indexOf(fn);
      if (i >= 0) ctx.tickers.splice(i, 1);
    }
    for (const id of bag.intervals) clearInterval(id);
    for (const el of bag.doms) el.remove();
    for (const f of bag.custom) { try { f(); } catch (e) { console.warn('[hot] 自定义清理失败:', name, e); } }
  };
  // 捕获期间创建的:场景对象(s.add)/body DOM/定时器/每帧 ticker
  bag._origAdd = ctx.scene.s.add.bind(ctx.scene.s);
  ctx.scene.s.add = (...a) => { bag.objs.push(...a); return bag._origAdd(...a); };
  bag._origAppend = document.body.appendChild.bind(document.body);
  document.body.appendChild = (el) => { bag.doms.push(el); return bag._origAppend(el); };
  bag._origSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, t, ...r) => { const id = bag._origSetInterval(fn, t, ...r); bag.intervals.push(id); return id; };
  bag._origOnTick = ctx.onTick;
  ctx.onTick = (fn) => { bag.tickers.push(fn); return bag._origOnTick(fn); };
  return bag;
}

export function hotEnd(name) {
  const bag = REG[name];
  if (!bag) return;
  ctx.scene.s.add = bag._origAdd;
  document.body.appendChild = bag._origAppend;
  window.setInterval = bag._origSetInterval;
  ctx.onTick = bag._origOnTick;
}
