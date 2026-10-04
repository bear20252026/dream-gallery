// core/gameshell-system.js — 游戏外壳·手绘风 UI 层(2026-08-29)
// 一次性交付三块,全部接到现有 ctx 状态:
//   1) 对话框(gameDialog) —— 把 ctx.ui.kunlunSpeak 升级为手绘底栏对话框(说话人+打字机+点击推进),
//      并暴露 ctx.openDialog({speaker,lines,choices}) 选项 API;所有已有昆仑台词(序章/答题/上传/换色…)
//      都自动落进手绘框,即"系统交互"的对话框呈现。
//   2) 任务栏(questHud) —— 左上常驻羊皮卷,显示当前主线 + 子进度(灵蕴/挂画/飞舟),由 game-state 驱动。
//   3) 系统菜单(gameMenu) —— 右上毛笔按钮 → 模态卷轴菜单(问昆仑/操作指引/任务册/继续)。
// 纯表现层(presentation/ui),经组合根装配,与 toast/overlay 同通道。无业务逻辑。
import { ctx } from '../ctx.js';
import { eventBus } from './event-bus.js';
import { GLOBAL, tt } from '../shared/story-text.mjs';
import { defineSystem } from './system.js';
import { createDialogSystem } from './gameshell-dialog.js'; // 对话框状态机(B5 外迁)
import { readPages, storyBeat, storyNext, PAGES_TOTAL } from '../shared/story-progress.mjs'; // 书页映射+进程节拍单一权威(2026-09-24 抽出;2026-09-26 加 storyBeat;2026-09-27 加 storyNext;2026-10-03 改用 readPages 单一真相 + PAGES_TOTAL 作分母)
import { JOURNEY_TEXT, TASKS } from '../shared/journey-logic.mjs';
import { legacyOn } from '../shared/legacy.mjs';
import { i18nAttr } from '../ui/i18n-dom.js'; // 界面文字中英切换(2026-10-03 英文为默认)

// ---------- 手绘样式(一次性注入,羊皮纸 + 抖边 + 楷体笔触) ----------
const STYLE = `
#gameDialog,#questHud,#gameMenu,.gs-menu-card{
  font-family:"Kaiti SC","STKaiti","KaiTi","楷体","Noto Serif SC",cursive !important;
  -webkit-font-smoothing:antialiased;
}
/* ===== 对话框:手绘羊皮卷 ===== */
#gameDialog{
  position:fixed;left:50%;bottom:3.2vh;transform:translateX(-50%) rotate(-.5deg);
  width:min(760px,92vw);z-index:80;display:none;
  pointer-events:auto;cursor:pointer;user-select:none;
  padding:22px 26px 18px;
  color:#3a2a1c;
  background:
    radial-gradient(120% 140% at 20% 0%,rgba(255,250,235,.96),rgba(244,233,208,.96) 60%,rgba(232,217,184,.96));
  border:2.5px solid #4a3526;
  border-radius:255px 14px 225px 16px / 16px 225px 14px 255px;
  box-shadow:0 6px 22px rgba(0,0,0,.35), inset 0 0 0 1.4px #6b4f37, inset 0 0 26px rgba(120,86,40,.18);
}
#gameDialog::before{ /* 第二道铅笔描边,强化手绘感 */
  content:"";position:absolute;inset:5px;pointer-events:none;
  border:1.5px solid rgba(74,53,38,.55);
  border-radius:230px 18px 210px 18px / 18px 210px 16px 230px;
}
.gs-name{
  position:absolute;top:-16px;left:26px;
  padding:3px 16px;font-size:17px;letter-spacing:2px;color:#fff5e0;
  background:linear-gradient(135deg,#b9743a,#8a4f23);
  border:2px solid #4a3526;border-radius:14px 9px 16px 8px / 9px 16px 8px 14px;
  box-shadow:0 3px 8px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,240,210,.4);
}
/* 说话人类型(2026-09-07 剧本对话角色区分) */
#gameDialog[data-spk='prince']{border-color:#c8a050}
#gameDialog[data-spk='prince'] .gs-name{background:linear-gradient(135deg,#c8a050,#9a7a30);color:#fff5e0}
#gameDialog[data-spk='pilot']{border-color:#6a8aaf}
#gameDialog[data-spk='pilot'] .gs-name{background:linear-gradient(135deg,#6a8aaf,#4a6a8f);color:#fff}
#gameDialog[data-spk='sheep']{border-color:#d4a0a0}
#gameDialog[data-spk='sheep'] .gs-name{background:linear-gradient(135deg,#d4a0a0,#b08080);color:#fff5e0}
#gameDialog[data-spk='rose']{border-color:#b05050}
#gameDialog[data-spk='rose'] .gs-name{background:linear-gradient(135deg,#b05050,#8a3030);color:#ffddd0}
#gameDialog[data-spk='king']{border-color:#7a5a9a}
#gameDialog[data-spk='king'] .gs-name{background:linear-gradient(135deg,#7a5a9a,#4e3670);color:#f3e8ff}
#gameDialog[data-spk='vain']{border-color:#c06a9a}
#gameDialog[data-spk='vain'] .gs-name{background:linear-gradient(135deg,#c06a9a,#8a406a);color:#ffeef5}
#gameDialog[data-spk='tippler']{border-color:#7a8a5a}
#gameDialog[data-spk='tippler'] .gs-name{background:linear-gradient(135deg,#7a8a5a,#55603c);color:#f2f5e8}
.gs-text{font-size:19px;line-height:1.85;min-height:1.85em;letter-spacing:.6px;
  text-shadow:0 1px 0 rgba(255,250,235,.6);}
.gs-caret{display:inline-block;width:.5em;color:#a35a1e;animation:gsBlink 1s steps(1) infinite;}
@keyframes gsBlink{50%{opacity:0}}
.gs-choices{margin-top:14px;display:flex;flex-direction:column;gap:10px;}
.gs-choice{
  align-self:flex-start;max-width:88%;text-align:left;cursor:pointer;
  font-family:inherit;font-size:17px;letter-spacing:1px;color:#3a2a1c;
  padding:9px 18px;background:rgba(255,250,235,.7);
  border:2px solid #4a3526;border-radius:18px 10px 20px 9px / 10px 20px 9px 18px;
  box-shadow:inset 0 0 0 1px rgba(74,53,38,.35);transition:all .18s ease;
}
.gs-choice:hover{background:#caa15f;color:#fff5e0;transform:translateX(6px) rotate(-.6deg);}
.gs-hint{margin-top:8px;text-align:right;font-size:12px;color:#8a6a44;opacity:.7;letter-spacing:2px;}
.gs-next{display:block;margin:12px 0 0 auto;min-height:44px;padding:9px 20px;border:1px solid #8a6a44;border-radius:22px;background:#6b5634;color:#fff0cc;font:inherit;cursor:pointer}
/* 一次只给一条指令(2026-10-03 首访实测:对白/画板期间屏幕上同时有 3 处在说同一件事)
   对白中:任务卡只留一行「此刻该做什么」;画板上:画板自带说明,任务卡/罗盘/任务面板全部让位 */
body[data-dialog-open] #questHud .q-guidance{display:none}
body.scene2BoardActive #questHud,body.scene2BoardActive #storyCompass,body.scene2BoardActive #journeyTask,body.scene2BoardActive #gsMenuBtn{display:none!important}
body.scene2BoardActive #hudLang{top:auto!important;right:auto!important;left:16px!important;bottom:22px!important}
.q-guidance{font-size:12px;line-height:1.6;color:#cbb99b;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.q-guidance:empty{display:none}
/* 「轮到你开口」呼吸(2026-09-26 主人报「对话对情节的指引不清晰」):
   选项在等玩家点选时轻柔呼吸;只动 box-shadow 不动 transform,与 hover 位移不打架 */
@keyframes gsAwaitPulse{0%,100%{box-shadow:inset 0 0 0 1px rgba(74,53,38,.35),0 0 0 0 rgba(255,214,170,0)}50%{box-shadow:inset 0 0 0 1px rgba(74,53,38,.35),0 0 16px 3px rgba(255,200,140,.45)}}
#gameDialog.gs-await .gs-choice{animation:gsAwaitPulse 1.7s ease-in-out infinite}
#gameDialog.gs-await .gs-hint{opacity:1;color:#a35a1e}

/* ===== 任务栏:手绘羊皮卷(左上) ===== */
#questHud{
  position:fixed;left:16px;top:16px;z-index:70;width:min(248px,70vw);
  pointer-events:none;
  padding:16px 18px 14px;color:#3a2a1c;
  background:
    radial-gradient(130% 150% at 80% 0%,rgba(255,250,235,.94),rgba(244,233,208,.94) 62%,rgba(230,214,180,.94));
  border:2.5px solid #4a3526;
  border-radius:18px 230px 16px 200px / 230px 16px 200px 18px;
  box-shadow:0 5px 18px rgba(0,0,0,.3), inset 0 0 0 1.4px #6b4f37, inset 0 0 22px rgba(120,86,40,.16);
  transform:rotate(-1deg);
}
#questHud .q-title{font-size:15px;letter-spacing:3px;color:#8a4f23;
  border-bottom:2px dashed rgba(74,53,38,.4);padding-bottom:5px;margin-bottom:9px;}
#questHud .q-main{font-size:16px;line-height:1.6;margin-bottom:8px;color:#3a2a1c;}
#questHud .q-row{font-size:14px;line-height:1.7;display:flex;justify-content:space-between;gap:8px;}
#questHud .q-row .q-k{color:#6b4f37;white-space:nowrap;}
#questHud .q-row .q-v{color:#a35a1e;font-weight:700;}
/* 进程/下一步=整行块(2026-09-30 主人报「任务册不清晰」):长指引曾被塞进右列
   折成三行、标签竖断行 —— 改标签在上小字、正文整行可换行,一眼读到要做什么 */
#questHud .q-row.q-block{flex-direction:column;align-items:flex-start;gap:2px;
  padding:6px 0;border-bottom:1px dashed rgba(74,53,38,.25);}
#questHud .q-row.q-block .q-k{font-size:11.5px;letter-spacing:2.5px;opacity:.72;}
#questHud .q-row.q-block .q-v{font-size:14.5px;line-height:1.55;color:#8a4a12;white-space:normal;}
#questFold{position:absolute;top:9px;right:11px;width:22px;height:22px;border:1px solid rgba(74,53,38,.45);
  border-radius:6px;background:rgba(255,250,235,.88);color:#6b4f37;font-size:13px;line-height:1;
  cursor:pointer;pointer-events:auto;font-family:inherit}
#questHud.folded{width:auto;padding:9px 14px;}
#questHud.folded .q-main,#questHud.folded .q-rows{display:none}
#questHud.folded .q-title{border-bottom:none;margin-bottom:0;padding-bottom:0;font-size:13px}
#questHud .q-current{display:none}
#questHud.folded{width:min(225px,calc(100vw - 180px));transform:none;background:rgba(27,28,37,.9);border:1px solid #ae9263;color:#f4e7c8;border-radius:4px 16px;box-shadow:0 5px 18px #0004;padding:13px 16px}
#questHud.folded .q-title{font-size:10px;letter-spacing:3px;color:#c2aa7d;margin-right:22px}
#questHud.folded .q-current{display:block;font-size:15px;line-height:1.65;margin-top:7px;color:#f5e5bd}
body[data-dialog-open] #questHud.folded .q-current{font-size:13px}
@media(max-width:600px){#questHud.folded{left:10px;top:12px;width:calc(100vw - 174px);min-width:145px;padding:10px 12px}#questHud.folded .q-current{font-size:12px}#gameDialog{bottom:12px;width:calc(100vw - 28px);max-height:48dvh;overflow:auto;padding:18px 18px 12px}.gs-text{font-size:16px;line-height:1.65}.gs-choice{font-size:14px;min-height:44px}.gs-name{position:static;width:fit-content;margin:-8px 0 8px}.gs-choices{gap:7px}.gs-hint{font-size:10px}}

/* ===== 系统菜单按钮(右上毛笔印) ===== */
#gsMenuBtn{
  /* 2026-10-03 测试反馈「不知道『印』是什么」:改成带字的「☰ 菜单 / Menu」药丸,保留朱砂印章配色 */
  position:fixed;right:16px;top:16px;z-index:70;height:46px;padding:0 16px 0 13px;gap:7px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;
  color:#fff5e0;font-size:16px;letter-spacing:1px;font-family:inherit;white-space:nowrap;
  background:radial-gradient(circle at 38% 32%,#b9743a,#7c441f);
  border:2.5px solid #4a3526;border-radius:24px 20px 26px 18px / 20px 26px 18px 24px;
  box-shadow:0 4px 14px rgba(0,0,0,.35), inset 0 0 0 1.5px rgba(255,240,210,.35);
  transform:rotate(2deg);transition:transform .2s ease;
}
#gsMenuBtn .mb-icon{font-size:19px;line-height:1}
#gsMenuBtn:hover{transform:rotate(0deg) scale(1.06);}

/* ===== 系统菜单:手绘卷轴弹层 ===== */
#gameMenu{
  position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;
  background:rgba(20,12,18,.55);backdrop-filter:blur(2px);
}
.gs-menu-card{
  width:min(360px,88vw);padding:26px 28px 22px;color:#3a2a1c;text-align:center;max-height:92dvh;overflow:auto;box-sizing:border-box;
  background:radial-gradient(130% 150% at 50% 0%,rgba(255,250,235,.97),rgba(244,233,208,.97) 60%,rgba(230,214,180,.97));
  border:2.5px solid #4a3526;border-radius:24px 200px 22px 200px / 200px 22px 200px 24px;
  box-shadow:0 10px 36px rgba(0,0,0,.5), inset 0 0 0 1.4px #6b4f37;
  transform:rotate(-.6deg);
}
.gs-menu-card .m-title{font-size:22px;letter-spacing:6px;color:#8a4f23;margin-bottom:4px;}
.gs-menu-card .m-sub{font-size:12px;letter-spacing:2px;color:#8a6a44;margin-bottom:18px;}
.gs-menu-card .m-btn{
  display:block;width:100%;margin:10px 0;cursor:pointer;font-family:inherit;
  font-size:17px;letter-spacing:2px;color:#3a2a1c;padding:11px 0;
  background:rgba(255,250,235,.7);border:2px solid #4a3526;
  border-radius:16px 10px 18px 9px / 10px 18px 9px 16px;
  box-shadow:inset 0 0 0 1px rgba(74,53,38,.3);transition:all .18s ease;
}
.gs-menu-card .m-btn:hover{background:#caa15f;color:#fff5e0;transform:scale(1.02);}
`;

function createGameShellSystem() {
  let styleEl, dialogEl, questEl, menuBtn, menuEl, menuApi;
  let unsub = null;
  let prevKunlunSpeak = null;
  let acc = 0; // 任务栏刷新节流

  // 对话框状态机已外迁 core/gameshell-dialog.js(B5 整改)
  let unsubWorld;
  const dialogApi = createDialogSystem({
    getWorld: () => ctx.scene.activeWorld || 'main',
    isStoryBusy: () => !!ctx.ui.journey?.busy(),
  });

  // ---- 任务栏进度 ----
  function readProgress() {
    let spirits =
      ctx.kunlun && ctx.kunlun.spiritsGot
        ? ctx.kunlun.spiritsGot()
        : ctx.store.getSpirits
          ? ctx.store.getSpirits().length
          : 0;
    const chapter = ctx.store.num('planetsChapter'); // 星屑:每章一颗,与新剧情线取大
    spirits = Math.max(spirits, Math.min(chapter, 6));
    const picks = (ctx.store.json('eternalPicks', []) || []).length;
    let ark = '尚未启程';
    if (spirits >= 6) ark = '六颗星屑归位';
    else if (spirits >= 1) ark = '飞舟已现';
    let pages = 1;
    try {
      // 书页单一权威 = shared/story-progress.mjs 的 readPages()(2026-10-03)。
      // 此前此处自己拼 max(page1?1:0, CHAPTER_TO_PAGES[chapter]),与「进程」行不同源,
      // 会同时显示「进程:书页五 进行中」和「书页:1 / 9」这种自相矛盾的界面。
      pages = readPages({
        scene2: !!ctx.store.flag('scene2'),
        page1: !!ctx.store.flag('page1'),
        chapter: ctx.store.num('planetsChapter'),
        homeMemoryStep: ctx.store.num('homeMemoryStep'),
        endingStep: ctx.store.num('endingStep'),
      });
    } catch (e) {
      console.debug('[gameshell-system] 任务册书页映射读取失败(用兜底页数):', e);
    }
    let main;
    if (spirits < 6) main = tt(GLOBAL.questMain);
    else if (picks < 1)
      main = tt({ en: 'Hang your drawing in the eternal hall', zh: '在永恒展厅挂上你的画' });
    else main = tt({ en: 'B612 is lit — wander slowly', zh: 'B612 已亮，慢慢逛' });
    const beat = storyBeat({
      scene2: !!ctx.store.flag('scene2'),
      page1: !!ctx.store.flag('page1'),
      chapter: ctx.store.num('planetsChapter'),
      endingStep: ctx.store.num('endingStep'),
    });
    const next = storyNext({
      scene2: !!ctx.store.flag('scene2'),
      page1: !!ctx.store.flag('page1'),
      chapter: ctx.store.num('planetsChapter'),
      endingStep: ctx.store.num('endingStep'),
      world: ctx.scene.activeWorld || 'main',
    });
    return { spirits, picks, ark, main, pages, beat, next };
  }
  function refreshQuest() {
    if (!questEl) return;
    refreshMenu();
    const p = readProgress();
    const world = ctx.scene.activeWorld || 'main';
    const task = ctx.ui.journey?.state();
    const goal = ctx.ui.journey?.goal();
    const phase = ctx.ui.journey?.phase();
    const current =
      goal?.world === world
        ? tt(goal)
        : task
          ? tt(TASKS[task.id].title)
          : world === 'b612' && !ctx.store.flag('page1')
            ? tt({
                zh: '走近光点，听小王子讲他的家',
                en: 'Follow the light through memories of home',
              })
            : /^king/.test(world)
              ? tt({ zh: '陪小王子走完这段回忆', en: 'Witness this memory with the little prince' })
              : tt(p.next);
    const currentPhase = phase?.world === world ? phase : null;
    questEl.querySelector('.q-title').textContent = currentPhase
      ? tt(currentPhase.chapter) +
        (currentPhase.total ? ' · ' + currentPhase.step + '/' + currentPhase.total : '')
      : tt(JOURNEY_TEXT.action);
    // 对白期间任务卡只说「此刻该按什么」:有选项=选一句;否则=点继续(2026-10-03 首访实测:
    // 选项在等玩家时卡片仍写「点继续」,与对话框自相矛盾)
    const awaitingChoice = !!dialogEl?.classList.contains('gs-await');
    questEl.querySelector('.q-current').textContent = ctx.ui.dialogOpen?.()
      ? awaitingChoice
        ? tt({ zh: '轮到你 · 在下方选一句回应', en: 'Your turn · pick a reply below' })
        : tt({ zh: '聆听这一段 · 点「继续」', en: 'Listen · tap Continue' })
      : current;
    questEl.querySelector('.q-guidance').textContent = task?.feedback
      ? tt(task.feedback)
      : currentPhase?.hint
        ? tt(currentPhase.hint)
        : '';
    questEl.querySelector('.q-main').textContent = '◈ ' + p.main;
    const pr = questEl.querySelector('.q-rows');
    const rows = [
      // 进程/下一步=整行块(2026-09-30);书页/星屑/挂画/飞舟=紧凑双列
      [tt({ zh: '进程', en: 'Chapter' }), tt(p.beat), 1],
      [tt({ zh: '下一步', en: 'Next' }), current, 1],
      [tt({ zh: '书页', en: 'Pages' }), p.pages + ' / ' + PAGES_TOTAL, 0],
      [tt({ zh: '星屑', en: 'Stardust' }), p.spirits + ' / 6', 0],
      // 展厅挂画属于搁置的旧玩法(2026-10-03):只在 ?legacy=1 时显示
      ...(legacyOn() ? [[tt({ zh: '展厅挂画', en: 'Gallery' }), p.picks + ' / 20', 0]] : []),
    ];
    questEl.querySelector('.q-rows').innerHTML = rows
      .map(
        (r) =>
          `<div class="q-row${r[2] ? ' q-block' : ''}"><span class="q-k">${r[0]}</span><span class="q-v">${r[1]}</span></div>`
      )
      .join('');
  }

  // ---- 菜单 ----
  function refreshMenu() {
    if (!menuEl) return;
    const n = ctx.ui.portfolio?.count() || 0;
    const labels = {
      map: { zh: '章 节 地 图', en: 'Chapter map' },
      portfolio: { zh: '作 品 集 · ' + n + '/4', en: 'Portfolio · ' + n + '/4' },
      help: { zh: '操 作 指 引', en: 'How to play' },
      quest: { zh: '任 务 册', en: 'Story progress' },
      notebook: { zh: '旅 途 手 札', en: 'Travel notebook' },
      leave: { zh: '离 开 这 段 回 忆', en: 'Leave this memory' },
      controls: { zh: '怎 么 走 动', en: 'How to move' },
      lang: { zh: '语言 · English', en: 'Language · 中文' },
      music: ctx.store.flag('musicOff')
        ? { zh: '音乐 · 已关', en: 'Music · off' }
        : { zh: '音乐 · 开', en: 'Music · on' },
      close: { zh: '继 续 游 历', en: 'Continue journey' },
    };
    for (const [act, label] of Object.entries(labels))
      menuEl.querySelector('[data-act="' + act + '"]').textContent = tt(label);
    const mbLabel = menuBtn?.querySelector('.mb-label');
    if (mbLabel) mbLabel.textContent = tt({ zh: '菜单', en: 'Menu' });
    // 回忆世界里才有「离开」(取代原先屏幕中央常驻的「返回沙漠」大按钮,防新玩家误点)
    const leaveBtn = /** @type {HTMLElement} */ (menuEl.querySelector('[data-act="leave"]'));
    leaveBtn.style.display = (ctx.scene.activeWorld || 'main') === 'main' ? 'none' : '';
  }
  function buildMenu() {
    menuEl = document.createElement('div');
    menuEl.id = 'gameMenu';
    menuEl.setAttribute('role', 'dialog');
    menuEl.setAttribute('aria-modal', 'true');
    menuEl.innerHTML = `
      <div class="gs-menu-card">
        <div class="m-title">B 6 1 2</div>
        <div class="m-sub">a gallery for unfinished drawings</div>
        <button class="m-btn" data-act="map">章 节 地 图</button>
        <button class="m-btn" data-act="portfolio">作 品 集</button>
        <button class="m-btn" data-act="help">操 作 指 引</button>
        <button class="m-btn" data-act="quest">任 务 册</button>
        <button class="m-btn" data-act="notebook">旅 途 手 札</button>
        <button class="m-btn" data-act="leave">离 开 这 段 回 忆</button>
        <button class="m-btn m-phone" data-act="controls">怎 么 走 动</button>
        <button class="m-btn m-phone" data-act="lang">Language · 中文</button>
        <button class="m-btn m-phone" data-act="music">Music · on</button>
        <button class="m-btn" data-act="close">继 续 游 历</button>
      </div>`;
    document.body.appendChild(menuEl);
    refreshMenu();
    menuEl.querySelector('[data-act="notebook"]').onclick = () => {
      menuApi.close();
      ctx.ui.journey?.openNotebook();
    };
    /** @type {HTMLElement} */ (menuEl.querySelector('[data-act="map"]')).onclick = () => {
      menuApi.close();
      ctx.ui.chapterMap?.open();
    };
    /** @type {HTMLElement} */ (menuEl.querySelector('[data-act="portfolio"]')).onclick = () => {
      menuApi.close();
      ctx.ui.portfolio?.open();
    };
    menuEl.querySelector('[data-act="help"]').onclick = () => {
      menuApi.close();
      ctx.ui.journey?.openHelp();
    };
    menuEl.querySelector('[data-act="quest"]').onclick = () => {
      menuApi.close();
      questEl.classList.remove('folded');
      questEl.querySelector('#questFold').textContent = '－';
    };
    /** @type {HTMLElement} */ (menuEl.querySelector('[data-act="leave"]')).onclick = () => {
      menuApi.close();
      // 进度按段保存(homeMemoryStep 等),回来从当前段继续
      if ((ctx.scene.activeWorld || 'main') !== 'main') ctx.scene.toMainWorld?.();
    };
    // 手机上收进菜单的三个小钮(屏幕上的原钮在手机上隐藏,见 ui/hud-layout.js);直接转点原钮,行为一致
    const relay = (act, id, close) => {
      /** @type {HTMLElement} */ (menuEl.querySelector('[data-act="' + act + '"]')).onclick =
        () => {
          if (close) menuApi.close();
          document.getElementById(id)?.click();
          refreshMenu();
        };
    };
    relay('controls', 'ctlHelpBtn', true);
    relay('lang', 'hudLang', false);
    relay('music', 'ab', false);
    menuEl.querySelector('[data-act="close"]').onclick = () => menuApi.close();
    menuApi = ctx.overlay.register(menuEl, {
      display: 'flex',
      escapable: true,
      closeOnOutside: true,
    });
  }

  // ---- 系统装配 ----
  const system = defineSystem({
    name: 'gameshell',
    layer: 'presentation',
    phase: 'ui',
    order: 6,
    init() {
      window.__gsInitN = (window.__gsInitN || 0) + 1;
      if (window.__gsInitN > 1)
        console.warn('[gameshell] init 重复装配 #' + window.__gsInitN, new Error().stack);
      styleEl = document.createElement('style');
      styleEl.textContent = STYLE;
      document.head.appendChild(styleEl);

      dialogEl = document.createElement('div');
      dialogEl.id = 'gameDialog';
      dialogEl.setAttribute('role', 'dialog');
      dialogEl.setAttribute('aria-live', 'polite');
      dialogEl.innerHTML = `
        <div class="gs-name">B612</div>
        <div class="gs-text"></div>
        <div class="gs-choices"></div>
        <div class="gs-hint">▷ Tap to continue</div>
        <button type="button" class="gs-next">Continue →</button>`;
      dialogEl.addEventListener('click', dialogApi.advance);
      dialogEl.querySelector('.gs-next').onclick = (e) => {
        e.stopPropagation();
        dialogApi.advance();
      };
      document.body.appendChild(dialogEl);
      dialogApi.attach(dialogEl);

      questEl = document.createElement('div');
      questEl.id = 'questHud';
      questEl.innerHTML = `
        <button id="questFold" type="button" aria-label="Fold / unfold the story card" title="Fold / unfold">－</button>
        <div class="q-title">Story</div>
        <div class="q-main"></div>
        <div class="q-current"></div>
        <div class="q-guidance"></div>
        <div class="q-rows"></div>`;
      document.body.appendChild(questEl);
      // 收纳(2026-09-20 UI 清理):折叠成小签,偏好入 store
      const qFoldBtn = questEl.querySelector('#questFold');
      i18nAttr(qFoldBtn, 'aria-label', {
        en: 'Fold / unfold the story card',
        zh: '收起/展开任务册',
      });
      i18nAttr(qFoldBtn, 'title', { en: 'Fold / unfold', zh: '收起/展开' });
      const applyFold = function (folded) {
        questEl.classList.toggle('folded', !!folded);
        qFoldBtn.textContent = folded ? '＋' : '－';
      };
      try {
        const pref = ctx.store.json('uiFold', {}) || {};
        applyFold(pref.quest !== false);
      } catch (e) {
        console.debug('[gameshell-system] 任务册折叠偏好读取失败(保持展开):', e);
      }
      qFoldBtn.onclick = function () {
        const folded = !questEl.classList.contains('folded');
        applyFold(folded);
        try {
          ctx.store.setJson(
            'uiFold',
            Object.assign({}, ctx.store.json('uiFold', {}) || {}, { quest: folded })
          );
        } catch (e) {
          console.debug('[gameshell-system] 任务册折叠偏好保存失败(不影响本次折叠):', e);
        }
      };
      refreshQuest();

      menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.id = 'gsMenuBtn';
      menuBtn.innerHTML =
        '<span class="mb-icon" aria-hidden="true">☰</span><span class="mb-label">Menu</span>';
      i18nAttr(menuBtn, 'title', { en: 'Menu', zh: '菜单' });
      i18nAttr(menuBtn, 'aria-label', { en: 'Menu', zh: '菜单' });
      menuBtn.onclick = () => {
        menuApi ? menuApi.open() : null;
      };
      document.body.appendChild(menuBtn);
      buildMenu();

      // 对话事件总线:其他模块可 ctx.events.emit('ui:dialog', {...})
      unsub = eventBus.on('ui:dialog', (o) => dialogApi.open(o));
      unsubWorld = eventBus.on('world:changed', ({ from }) => dialogApi.cancelWorld(from));
      window.addEventListener('script:lang', refreshQuest);

      // 升级昆仑开口:既播 TTS,又落进手绘框(所有现有 kunlunSpeak 调用自动生效)
      prevKunlunSpeak = ctx.ui.kunlunSpeak;
      ctx.ui.kunlunSpeak = (/** @type {string} */ text, /** @type {string} */ voice) => {
        if (ctx.ui.journey?.busy() || dialogApi.locked()) return;
        if (prevKunlunSpeak) {
          try {
            prevKunlunSpeak(text, voice);
          } catch (e) {
            console.debug('[gameshell-system] 旧 kunlunSpeak 升级回调出错(不影响手绘框):', e);
          }
        }
        dialogApi.open({ speaker: dialogApi.speakerFor(voice), lines: [text], autoHide: 9000 });
      };
      ctx.ui.openDialog = dialogApi.open; // 剧本链统一入口(2026-09-18 收编;扁平读 ctx.openDialog 仍等价)
      ctx.ui.dialogOpen = dialogApi.isOpen; // 剧本链心跳守护用:对话框是否开着
      ctx.ui.cancelDialogScope = dialogApi.cancelScope;
      ctx.ui.advanceDialog = dialogApi.advance;
    },
    update(dt) {
      acc += dt;
      if (acc >= 0.5) {
        acc = 0;
        refreshQuest();
      }
    },
    dispose() {
      if (unsub) unsub();
      unsubWorld?.();
      window.removeEventListener('script:lang', refreshQuest);
      if (prevKunlunSpeak) ctx.ui.kunlunSpeak = prevKunlunSpeak;
      if (menuApi) menuApi.unregister();
      [styleEl, dialogEl, questEl, menuBtn, menuEl].forEach((n) => n && n.remove());
    },
  });
  return system;
}

export { createGameShellSystem };
