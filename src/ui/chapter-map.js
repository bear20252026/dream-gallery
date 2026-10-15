// ui/chapter-map.js — 章节地图 + 存档码(2026-10-03 测试建议「加存档与章节选择」)
// 菜单「章节地图」打开:按原著顺序列出各章,已完成的可以回去再看,当前章一键「从这里继续」,
// 没解锁的灰着(剧情是一条线,不许跳到后面)。下面是存档区:进度本来就每段自动保存,
// 另给「复制存档码 / 粘贴存档码」,换设备或清了浏览器也能接着玩。
// 章节状态/存档码在 shared/chapter-map-logic.mjs(单测钉死)。
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { tt, scriptLang } from '../shared/story-text.mjs';
import { HILL_TEXT, hillUrl } from '../shared/ending-logic.mjs';
import { Z } from '../shared/z-layers.mjs';
import { travel } from './world-travel.js';
import {
  chapterStates,
  canTravel,
  encodeSave,
  decodeSave,
  importSave,
  restoreSave,
} from '../shared/chapter-map-logic.mjs';

const TEXT = {
  title: { zh: '章节地图', en: 'Chapter map' },
  sub: {
    zh: '故事按原著的顺序走。走过的章节可以回去再看;没走到的,要先把前一章走完。',
    en: 'The story follows the book. You can go back to chapters you have finished; later ones open as you go.',
  },
  done: { zh: '已完成', en: 'Finished' },
  current: { zh: '进行中', en: 'In progress' },
  locked: { zh: '未解锁', en: 'Locked' },
  go: { zh: '从这里继续', en: 'Continue here' },
  revisit: { zh: '回去看看', en: 'Visit again' },
  replayEnd: { zh: '再看一次尾声', en: 'Watch the ending again' },
  hill: HILL_TEXT.go,
  here: { zh: '你在这里', en: 'You are here' },
  saveTitle: { zh: '存档', en: 'Saves' },
  saveAuto: {
    zh: '进度会在每一段剧情后自动保存在这个浏览器里。想换设备,或怕清掉浏览器数据,就复制一份存档码。',
    en: 'Progress saves itself in this browser after every part of the story. To move to another device — or to be safe before clearing browser data — copy a save code.',
  },
  copy: { zh: '复制存档码', en: 'Copy save code' },
  copied: { zh: '已复制 ✓ 存在备忘录里就好', en: 'Copied ✓ keep it in your notes' },
  load: { zh: '粘贴存档码', en: 'Paste a save code' },
  apply: { zh: '载入这份存档', en: 'Load this save' },
  bad: {
    zh: '这段存档码读不出来,请检查是否完整。',
    en: 'That save code could not be read. Please check it is complete.',
  },
  confirm: {
    zh: '载入后会替换当前进度并重新打开游戏。确定的话再点一次。',
    en: 'Loading replaces your current progress and reopens the game. Tap again to confirm.',
  },
  applySure: { zh: '确定,载入', en: 'Yes, load it' },
  undo: { zh: '撤销上一次载入', en: 'Undo last load' },
  undoConfirm: {
    zh: '把进度退回载入那份存档码**之前**的样子并重新打开。确定的话再点一次。',
    en: 'Returns your progress to what it was **before** that save code, then reopens the game. Tap again to confirm.',
  },
  undoSure: { zh: '确定,撤销', en: 'Yes, undo' },
  // —— M-04(第六轮审计):写失败必须说出来,不能"载入成功"地少存几项 ——
  noBackup: {
    zh: '这个浏览器存不下备份(存储已满或被禁用)。没有备份,载入出错就回不去了,已停止载入。',
    en: 'This browser could not store a backup (storage is full or disabled). Without a backup a wrong load cannot be undone, so nothing was loaded.',
  },
  partial: {
    zh: '有 N 项存档没能存下(存储已满或被禁用)。重新打开游戏看到的是实际存下的进度;想退回载入前,点「撤销上一次载入」。',
    en: 'N save field(s) could not be written (storage is full or disabled). Reopening the game shows what actually saved; to go back, use Undo last load.',
  },
  undoFail: {
    zh: '存档没能写回这个浏览器(存储已满或被禁用)。载入前的快照还在,可以再点一次重试。',
    en: 'The save could not be written back to this browser (storage is full or disabled). The snapshot from before the load is still there - tap again to retry.',
  },
  close: { zh: '合上', en: 'Close' },
  busy: {
    zh: '先把眼前这段对话或动作完成,再出发。',
    en: 'Finish what is on screen first, then travel.',
  },
};

const STYLE = `
#chapterMap{position:fixed;inset:0;z-index:${Z.chapterMap};display:none;align-items:center;justify-content:center;
 background:#111621d9;backdrop-filter:blur(8px);padding:18px;box-sizing:border-box}
#chapterMap .cm-book{background:#ece1c5;color:#44382e;max-width:640px;width:100%;max-height:88dvh;overflow:auto;
 border-radius:6px 24px 6px 24px;padding:24px 26px;box-shadow:0 24px 80px #0007;box-sizing:border-box;font-family:"Kaiti SC","STKaiti","KaiTi",serif}
#chapterMap .cm-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
#chapterMap h2{font-size:25px;letter-spacing:3px;margin:0}
#chapterMap h3{font-size:17px;letter-spacing:2px;margin:22px 0 6px;border-top:1px dashed #b8a587;padding-top:16px}
#chapterMap .cm-sub{font-size:13.5px;line-height:1.8;color:#79674e;margin:8px 0 14px}
#chapterMap ol{list-style:none;margin:0;padding:0;position:relative}
#chapterMap ol::before{content:"";position:absolute;left:13px;top:14px;bottom:14px;border-left:2px dotted #b8a587}
#chapterMap li{position:relative;display:flex;gap:12px;align-items:center;padding:9px 0}
#chapterMap .cm-dot{flex:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
 font:13px/1 sans-serif;background:#ece1c5;border:2px solid #b8a587;color:#8c7a5c;z-index:1}
#chapterMap li[data-state="done"] .cm-dot{background:#5f7b4a;border-color:#5f7b4a;color:#fff}
#chapterMap li[data-state="current"] .cm-dot{background:#c98a4b;border-color:#8a5a2a;color:#fff;box-shadow:0 0 0 4px #c98a4b33}
#chapterMap li[data-state="locked"]{opacity:.5}
#chapterMap .cm-text{flex:1;min-width:0}
#chapterMap .cm-t{font-size:16px;line-height:1.4}
#chapterMap .cm-n{font-size:12px;color:#8c7a5c;line-height:1.5}
#chapterMap .cm-s{font-size:11px;letter-spacing:1px;color:#8c7a5c}
#chapterMap button{font:inherit;cursor:pointer;color:#fff0cc;background:#6b5634;border:1px solid #af9361;border-radius:20px;padding:7px 14px;min-height:40px;white-space:nowrap}
#chapterMap button.ghost{background:transparent;color:#6b5634}
#chapterMap .cm-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px}
#chapterMap textarea{width:100%;box-sizing:border-box;min-height:64px;margin-top:8px;font:12px/1.4 monospace;border:1px solid #b8a587;border-radius:8px;background:#f9f0da;color:#44382e;padding:8px}
#chapterMap .cm-msg{font-size:13px;color:#8a4a12;min-height:1.4em}
@media(max-width:600px){#chapterMap .cm-book{padding:18px}#chapterMap li{flex-wrap:wrap}#chapterMap .cm-text{flex-basis:calc(100% - 40px)}#chapterMap li button{margin-left:40px}}
`;

function flags() {
  return {
    scene2: !!ctx.store.flag('scene2'),
    page1: !!ctx.store.flag('page1'),
    chapter: ctx.store.num('planetsChapter'),
    endingStep: ctx.store.num('endingStep'),
    earthDay: !!ctx.store.flag('earthDay'),
  };
}

export function createChapterMap() {
  let style, root, api;
  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function render() {
    root.replaceChildren();
    const book = el('div', 'cm-book', null, root);
    const head = el('div', 'cm-head', null, book);
    el('h2', '', tt(TEXT.title), head);
    const close = el('button', 'cm-close ghost', tt(TEXT.close), head);
    close.type = 'button';
    el('p', 'cm-sub', tt(TEXT.sub), book);
    const list = el('ol', '', null, book);
    const world = ctx.scene.activeWorld || 'main';
    chapterStates(flags()).forEach((c, i) => {
      const li = el('li', '', null, list);
      li.dataset.state = c.state;
      li.dataset.chapter = c.id;
      el('span', 'cm-dot', c.state === 'done' ? '✓' : String(i + 1), li);
      const text = el('div', 'cm-text', null, li);
      el('div', 'cm-t', tt(c.title), text);
      el('div', 'cm-n', tt(c.note), text);
      const here = c.state === 'current' && c.world === world && c.world !== 'main';
      el('div', 'cm-s', here ? tt(TEXT.here) : tt(TEXT[c.state]), text);
      if (!canTravel(c.state)) return;
      let label = null,
        action = null;
      if (c.id === 'ending' && c.state === 'done' && ctx.scene.endingApi?.epilogue) {
        label = TEXT.replayEnd;
        action = () => travel('main').then(() => ctx.scene.endingApi.epilogue());
      } else if (c.world !== world) {
        label = c.state === 'current' ? TEXT.go : TEXT.revisit;
        action = () => travel(c.world);
      } else if (c.state === 'current') {
        label = TEXT.go; // 已在这一章的世界里:合上地图,继续眼前的指引
        action = () => Promise.resolve(true);
      }
      if (!label) return;
      const b = el('button', c.state === 'done' ? 'ghost' : '', tt(label), li);
      b.type = 'button';
      b.dataset.go = c.id;
      b.onclick = () => {
        if (ctx.ui.dialogOpen?.()) {
          ctx.ui.modeToast?.(tt(TEXT.busy));
          return;
        }
        api.close();
        action();
      };
      // 书写完以后:章节地图里也能直接去远方山丘(故事之后的落脚处)
      if (c.id === 'ending' && c.state === 'done') {
        const h = el('button', '', tt(TEXT.hill), li);
        h.type = 'button';
        h.dataset.go = 'hill';
        h.onclick = () => {
          location.href = hillUrl(scriptLang());
        };
      }
    });
    // —— 存档 ——
    el('h3', '', tt(TEXT.saveTitle), book);
    el('p', 'cm-sub', tt(TEXT.saveAuto), book);
    const row = el('div', 'cm-row', null, book);
    const copy = el('button', '', tt(TEXT.copy), row);
    copy.type = 'button';
    copy.dataset.save = 'copy';
    const load = el('button', 'ghost', tt(TEXT.load), row);
    load.type = 'button';
    load.dataset.save = 'load';
    // 载入前快照(2026-10-14 第五轮审计 G):导错码就等于覆盖当前进度,而玩家手上常常只有那份
    // 几个月前复制的码 ⇒ 回不去。有备份才多这颗按钮(没备份时不摆一个点了没东西可撤的空位)。
    const rawBackup = ctx.store.json('saveBackup', null);
    const backup =
      rawBackup && rawBackup.data && typeof rawBackup.data === 'object' ? rawBackup : null;
    let undo = null;
    if (backup) {
      const when = new Date(Number(backup.at) || 0).toLocaleDateString(
        scriptLang() === 'en' ? 'en' : 'zh-CN'
      );
      undo = el('button', 'ghost', tt(TEXT.undo) + ' · ' + when, row);
      undo.type = 'button';
      undo.dataset.save = 'undo';
      undo.onclick = () => {
        if (undo.dataset.armed !== '1') {
          undo.dataset.armed = '1';
          msg.textContent = tt(TEXT.undoConfirm);
          undo.textContent = tt(TEXT.undoSure);
          return;
        }
        // 快照存的是**字段值本身**,不经 decodeSave ⇒ 不会被它的钳位(str 截 40、num 夹 0-99)改写
        const r = restoreSave(ctx.store, backup);
        if (r.action === 'partial') {
          // 撤到一半就 reload = 把"实际存下了什么"藏起来;快照也没清,清了就再没有重试的依据
          console.warn('[chapter-map] 撤销未能落盘:', r.failed.join(', '));
          undo.dataset.armed = '';
          undo.textContent = tt(TEXT.undo) + ' · ' + when; // 标签复原(带日期那版)
          msg.textContent = tt(TEXT.undoFail);
          return;
        }
        location.reload();
      };
    }
    const msg = el('div', 'cm-msg', '', book);
    const box = el('textarea', '', null, book);
    box.style.display = 'none';
    box.setAttribute('aria-label', tt(TEXT.load));
    const apply = el('button', '', tt(TEXT.apply), book);
    apply.type = 'button';
    apply.style.display = 'none';
    copy.onclick = async () => {
      const code = encodeSave(ctx.store);
      box.style.display = 'block';
      box.value = code;
      apply.style.display = 'none';
      try {
        await navigator.clipboard.writeText(code);
        msg.textContent = tt(TEXT.copied);
      } catch (e) {
        box.select(); // 剪贴板不可用(非 https/旧浏览器):选中让玩家手动复制
      }
    };
    load.onclick = () => {
      box.style.display = 'block';
      box.value = '';
      apply.style.display = 'inline-block';
      msg.textContent = '';
      box.focus();
    };
    apply.onclick = () => {
      const data = decodeSave(box.value);
      if (!data) {
        msg.textContent = tt(TEXT.bad);
        return;
      }
      // 页内二次确认(不用浏览器 confirm 弹窗):第一次点只提示,再点一次才载入
      if (apply.dataset.armed !== '1') {
        apply.dataset.armed = '1';
        msg.textContent = tt(TEXT.confirm);
        apply.textContent = tt(TEXT.applySure);
        return;
      }
      // 顺序(先快照、后覆盖、只有全落盘才 reload)在 shared/chapter-map-logic.mjs 的 importSave 里,单测钉死
      const r = importSave(ctx.store, data);
      if (r.action === 'noBackup') {
        apply.dataset.armed = '';
        apply.textContent = tt(TEXT.apply);
        msg.textContent = tt(TEXT.noBackup);
        return;
      }
      if (r.action === 'partial') {
        console.warn('[chapter-map] 载入未能全部落盘:', r.failed.join(', '));
        apply.dataset.armed = '';
        apply.textContent = tt(TEXT.apply);
        msg.textContent = tt(TEXT.partial).replace('N', String(r.failed.length));
        return; // 不 reload:提示会被刷掉,而这份缺项进度要玩家自己决定重开还是撤销
      }
      location.reload();
    };
  }
  const onLang = () => {
    if (api?.isOpen()) render();
  };
  return defineSystem({
    name: 'chapterMap',
    layer: 'presentation',
    phase: 'ui',
    order: 11,
    init() {
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.id = 'chapterMap';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      document.body.appendChild(root);
      api = ctx.overlay.register(root, { display: 'flex', x: '.cm-close' });
      ctx.ui.chapterMap = {
        open() {
          render();
          api.open();
          if (document.pointerLockElement) document.exitPointerLock();
          /** @type {HTMLElement|null} */ (root.querySelector('.cm-close'))?.focus();
        },
      };
      window.addEventListener('script:lang', onLang);
    },
    dispose() {
      window.removeEventListener('script:lang', onLang);
      api?.unregister();
      style?.remove();
      root?.remove();
      ctx.ui.chapterMap = null;
    },
  });
}
