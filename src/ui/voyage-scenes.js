// voyage-scenes.js — 「星之旅程」四幕(2026-11-16 改挂故事线节拍)
// 主人要求:四个 voxel 场景**融入六星故事线**,顺着故事走自然出现,不是独立存在的门/网页。
// 故事顺序(与原著/主线一致):
//   第一幕 他的星球  ← 首次回到 B612(世界切换到 b612)
//   第二幕 狐狸与麦田 ← 狐狸驯养仪式完成(fox:rite days>=3)
//   第三幕 玫瑰园    ← 地球之日走到玫瑰园站(earthStep>=4)
//   第四幕 云海之鲤  ← 首次乘鲤飞行(planeFlown.flew)
// 形态:openfilm 式全屏放映覆盖层(同源 iframe 承载单文件场景,独立渲染器不碰主循环)。
// 触发:剧情节拍到达且该幕未看 → 延迟数秒自动开幕(不打断对话/过场/飞行)。
// 回顾:HUD「✦」只重看**已经历**的幕;未到的幕显示"随故事解锁"。进度存 voyageScenes(已登记 SCHEMA)。
// 生命周期:组合根 init/dispose 对称;iframe 关闭即摘;事件/tick 对称卸载。
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs'; // 双语单一源:字幕/按钮跟随 scriptLang

// 本次会话是否到过 B612(世界切换信号;持久标记另存 voyageB612)
let seenB612 = false;

// 四幕:标题/旁白/场景文件/触发判定。旁白只走小王子一条叙事线。
// reached():读既有存档信号,不新增进度来源(与成就"只读既有进度"同口径)。
export const VOYAGE_ACTS = [
  {
    id: 'b612',
    file: '/voxel/b612.html',
    title: { zh: '第一幕 · 他的星球', en: 'Act I · His Planet' },
    sub: { zh: 'B612 · 三座火山与一朵玫瑰', en: 'B612 · three volcanoes and one rose' },
    hint: { zh: '回到 B612，看看他的星球', en: 'Return to B612 to see his planet' },
    reached: () => seenB612 || !!ctx.store.flag('voyageB612'),
    lines: [
      {
        zh: '他来自一颗很小的星球，小到只容得下三座火山和一朵玫瑰。',
        en: 'He came from a tiny planet, just big enough for three volcanoes and one rose.',
      },
      {
        zh: '他每天疏通火山、给她浇水、盖上玻璃罩——她单独一朵，就比你们全部更重要。',
        en: 'He cleaned the volcanoes, watered her, covered her with glass — she alone mattered more than all the rest.',
      },
    ],
  },
  {
    id: 'fox',
    file: '/voxel/fox.html',
    title: { zh: '第二幕 · 狐狸与麦田', en: 'Act II · The Fox and the Wheat' },
    sub: { zh: '驯养 · 金黄色的麦子', en: 'Taming · the golden wheat' },
    hint: { zh: '完成狐狸的驯养仪式', en: 'Complete the fox taming rite' },
    reached: () => {
      const r = ctx.store.json('foxRite', null);
      return !!r && (r.days || 0) >= 3;
    },
    lines: [
      {
        zh: '狐狸说：「如果你驯养了我，我们就彼此需要了。」',
        en: 'The fox said: "If you tame me, we shall need each other."',
      },
      {
        zh: '「看到那边的麦田了吗？麦子金黄色的，会让我想起你。我会爱上风穿过麦浪的声音。」',
        en: '"See the wheat fields? The golden wheat will remind me of you. I shall love the sound of wind in the wheat."',
      },
    ],
  },
  {
    id: 'rose',
    file: '/voxel/rose.html',
    title: { zh: '第三幕 · 玫瑰园', en: 'Act III · The Rose Garden' },
    sub: {
      zh: '五千朵玫瑰，与独一无二的那一朵',
      en: 'Five thousand roses, and the one that is unique',
    },
    hint: { zh: '地球之日，走到玫瑰园', en: 'On Earth day, reach the rose garden' },
    reached: () => (ctx.store.num('earthStep') || 0) >= 4,
    lines: [
      {
        zh: '地球上有一座玫瑰园，五千朵玫瑰和她长得一模一样。',
        en: 'On Earth there was a garden of five thousand roses, all just like her.',
      },
      {
        zh: '可他明白了：是他为她花费的时间，让她变得如此重要。',
        en: 'But he understood: it was the time he had spent on her that made her so important.',
      },
    ],
  },
  {
    id: 'koi',
    file: '/voxel/koi.html',
    title: { zh: '第四幕 · 云海之鲤', en: 'Act IV · Koi of the Cloud Sea' },
    sub: { zh: '天空の鯉 · 带着花园去远方', en: 'Sky koi · carrying a garden afar' },
    hint: { zh: '第一次乘鲤飞上云海', en: 'Fly the koi above the clouds once' },
    reached: () => {
      const f = ctx.store.json('planeFlown', null);
      return !!f && !!f.flew;
    },
    lines: [
      {
        zh: '后来他乘着云海里的巨鲤远行，背上驮着一整座花园。',
        en: 'Later he rode a great koi through the sea of clouds, a whole garden on its back.',
      },
      {
        zh: '「夜晚你仰望星空，因为我住在其中一颗上，于是满天的星都像在笑。」',
        en: '"At night you will look up at the stars; I live on one of them, so all the stars will seem to laugh."',
      },
    ],
  },
];

const STYLE = `
#voyageScenes{position:fixed;inset:0;background:#070613;display:none;flex-direction:column;
  font:14px/1.6 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#f5efe6}
#voyageScenes .vs-frame{flex:1;min-height:0;border:0;width:100%;height:100%;background:#070613}
#voyageScenes .vs-bar{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:12px;
  padding:12px 18px;background:linear-gradient(180deg,rgba(7,6,19,.92),rgba(7,6,19,0));pointer-events:none}
#voyageScenes .vs-bar>*{pointer-events:auto}
#voyageScenes .vs-title{font-size:15px;letter-spacing:1px;color:#f5c451;font-weight:600}
#voyageScenes .vs-sub{font-size:12px;color:#c3b9cf}
#voyageScenes .vs-spacer{flex:1}
#voyageScenes button{font:inherit;color:#f5efe6;background:rgba(23,18,44,.85);border:1px solid rgba(247,168,191,.3);
  border-radius:10px;padding:7px 14px;cursor:pointer;transition:background .18s,border-color .18s}
#voyageScenes button:hover{background:rgba(224,50,75,.3);border-color:rgba(245,196,81,.6)}
#voyageScenes button:focus-visible{outline:2px solid #f5c451;outline-offset:2px}
#voyageScenes .vs-cap{position:absolute;left:0;right:0;bottom:0;padding:16px 20px 18px;
  background:linear-gradient(0deg,rgba(7,6,19,.94),rgba(7,6,19,0));display:flex;flex-direction:column;gap:10px}
#voyageScenes .vs-line{max-width:760px;margin:0 auto;text-align:center;font-size:15px;color:#f5efe6;
  text-shadow:0 1px 10px rgba(0,0,0,.8);min-height:24px}
#voyageScenes .vs-acts{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
#voyageScenes .vs-acts button.primary{background:linear-gradient(150deg,rgba(245,196,81,.3),rgba(224,50,75,.32));
  border-color:rgba(245,196,81,.55);color:#ffe9c2}
#vsEntry{position:fixed;right:18px;bottom:64px;z-index:35;width:46px;height:46px;border-radius:50%;
  border:1px solid rgba(245,196,81,.5);background:radial-gradient(circle at 35% 30%,rgba(245,196,81,.35),rgba(23,18,44,.9));
  color:#f5c451;font-size:20px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.5);transition:transform .18s}
#vsEntry:hover{transform:scale(1.08)}
#vsEntry:focus-visible{outline:2px solid #f5c451;outline-offset:2px}
#vsEntry.vs-done{border-color:rgba(245,196,81,.9);color:#ffe9c2;
  box-shadow:0 0 18px rgba(245,196,81,.5),0 4px 18px rgba(0,0,0,.5)}
@media (max-width:900px){#vsEntry{right:12px;bottom:110px}#voyageScenes .vs-sub{display:none}}
`;

export function createVoyageScenes() {
  let root = null,
    frame = null,
    entry = null,
    style = null,
    api = null;
  let actIdx = 0,
    lineIdx = 0,
    done = [];
  let offWorld = null,
    offFox = null,
    offTick = null;
  let quiet = 0, // 安静窗口起点(墙钟)
    checkT = 0;
  let gameMode = false, // 第一幕内正在玩「B612 的一天」
    gameBest = 0,
    gameWins = 0,
    onGameMsg = null;

  function readDone() {
    try {
      const v = ctx.store.json('voyageScenes');
      gameBest = (v && v.gameBest) || 0;
      gameWins = (v && v.gameWins) || 0;
      return Array.isArray(v && v.done) ? v.done : [];
    } catch (e) {
      return [];
    }
  }
  function writeDone() {
    try {
      ctx.store.setJson('voyageScenes', { done, gameBest, gameWins });
    } catch (e) {}
    refreshEntry();
  }
  function reached(i) {
    try {
      return !!VOYAGE_ACTS[i].reached();
    } catch (e) {
      return false;
    }
  }
  function refreshEntry() {
    if (!entry) return;
    const n = done.length;
    entry.textContent = n >= VOYAGE_ACTS.length ? '✦' : '✧';
    entry.title = tt({
      zh: '旅程回顾 · 已经历 ' + n + '/' + VOYAGE_ACTS.length + ' 幕',
      en: 'Journey recap · ' + n + '/' + VOYAGE_ACTS.length + ' acts lived',
    });
    entry.setAttribute('aria-label', tt({ zh: '打开旅程回顾', en: 'Open journey recap' }));
    entry.classList.toggle('vs-done', n >= VOYAGE_ACTS.length);
  }
  function renderCap() {
    const act = VOYAGE_ACTS[actIdx];
    const line = root.querySelector('.vs-line');
    const acts = root.querySelector('.vs-acts');
    line.textContent = act.lines[lineIdx] ? tt(act.lines[lineIdx]) : '';
    root.querySelector('.vs-title').textContent = tt(act.title);
    root.querySelector('.vs-sub').textContent = tt(act.sub);
    const exitB = root.querySelector('.vs-exit');
    if (exitB) exitB.textContent = '✕ ' + tt({ zh: '回到故事', en: 'Back to the story' });
    acts.innerHTML = '';
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = fn;
      acts.appendChild(b);
      return b;
    };
    if (lineIdx < act.lines.length - 1) {
      mk(tt({ zh: '下一句 ›', en: 'Next ›' }), '', () => {
        lineIdx++;
        renderCap();
      });
    } else {
      if (!done.includes(act.id)) {
        done.push(act.id);
        writeDone();
      }
      // 第一幕看完:邀请玩家亲手替小王子打理一天(可玩幕间,成绩进同一存档)
      if (act.id === 'b612') {
        if (gameMode) {
          mk(tt({ zh: '‹ 回到他的玫瑰', en: '‹ Back to his rose' }), '', () => {
            gameMode = false;
            frame.src = base + act.file.split('/').pop();
            renderCap();
          });
          if (gameBest > 0) {
            line.textContent = tt({
              zh: '你替他守住了这一天。最佳 ' + gameBest + ' 分 · 守住 ' + gameWins + ' 次。',
              en:
                'You kept this day for him. Best ' +
                gameBest +
                ' pts · held ' +
                gameWins +
                ' times.',
            });
          } else {
            line.textContent = tt({
              zh: '现在轮到你了：拔幼苗、浇玫瑰、通火山——撑过六波。',
              en: 'Now it is your turn: pull sprouts, water the rose, clean volcanoes — survive six waves.',
            });
          }
        } else {
          mk(
            tt({
              zh: gameBest > 0 ? '再帮他一天 · 最佳 ' + gameBest : '帮他打理这一天 ›',
              en: gameBest > 0 ? 'Another day · best ' + gameBest : 'Tend this day for him ›',
            }),
            'primary',
            () => {
              gameMode = true;
              frame.src = base + 'b612-game.html';
              renderCap();
            }
          );
        }
      }
      // 下一幕:已经历才能继续;否则提示随故事解锁
      const nxt = actIdx + 1;
      if (nxt < VOYAGE_ACTS.length) {
        if (reached(nxt)) {
          mk(tt({ zh: '继续旅程 ›', en: 'Continue ›' }), 'primary', () => openAct(nxt));
        } else {
          mk(tt({ zh: '下一幕随故事解锁', en: 'Next act unlocks with the story' }), '', () =>
            ctx.ui.modeToast?.(tt(VOYAGE_ACTS[nxt].hint))
          );
        }
      } else {
        line.textContent = tt({
          zh: '四幕走完。星星发亮，是为了让每一个人有一天都能找到属于自己的星星。',
          en: 'The four acts are done. The stars shine so that one day everyone may find their own.',
        });
        mk(
          tt({ zh: '旅程完成 · 回到故事', en: 'Journey complete · back to the story' }),
          'primary',
          () => api.close()
        );
      }
    }
    mk(tt({ zh: '重看此幕', en: 'Replay act' }), '', () => openAct(actIdx));
    mk(tt({ zh: '回到故事', en: 'Back to the story' }), '', () => api.close());
    const dots = document.createElement('span');
    dots.style.cssText = 'align-self:center;color:#c3b9cf;font-size:12px;margin-left:6px';
    dots.textContent = VOYAGE_ACTS.map((a, i) =>
      i === actIdx ? '●' : done.includes(a.id) ? '✦' : reached(i) ? '○' : '🔒'
    ).join(' ');
    acts.appendChild(dots);
  }
  // 场景文件在 public/voxel/:vite 构建后落在 /voxel/,dev 服务器根=仓库根则需 /public/voxel/。
  let base = '/voxel/';
  function probeBase() {
    fetch('/voxel/b612.html', { method: 'HEAD' })
      .then((r) => {
        if (!r.ok) base = '/public/voxel/';
      })
      .catch(() => {
        base = '/public/voxel/';
      });
  }
  function onLang() {
    if (api && api.isOpen()) renderCap();
    refreshEntry();
  }
  function openAct(i) {
    actIdx = Math.max(0, Math.min(VOYAGE_ACTS.length - 1, i));
    if (!reached(actIdx)) {
      ctx.ui.modeToast?.(tt(VOYAGE_ACTS[actIdx].hint));
      return;
    }
    quiet = 0;
    lineIdx = 0;
    gameMode = false;
    const act = VOYAGE_ACTS[actIdx];
    frame.src = base + act.file.split('/').pop(); // 同源单文件场景;独立渲染器,不碰主循环
    renderCap();
    api.open();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /* ── 故事节拍触发:到达且未看 → 延迟自动开幕(不打断对话/过场/飞行) ── */
  function busy() {
    return (
      (api && api.isOpen()) ||
      !!ctx.ui.dialogOpen?.() ||
      !!ctx.overlay.anyOpen() ||
      !!ctx.kunlun.flightLock ||
      !!ctx.scene.worldManager?.transitioning
    );
  }
  function storyTick(dt) {
    checkT += dt;
    if (checkT < 0.5) return;
    checkT = 0;
    // 安静窗口:连续 1.5s 无对话/过场/飞行才自动开幕,避免被剧情链反复打断
    if (busy()) {
      quiet = 0;
      return;
    }
    if (!quiet) quiet = performance.now();
    if (performance.now() - quiet < 1500) return;
    // 按故事顺序找第一个"已到达且未看"的幕,直接开幕
    for (let i = 0; i < VOYAGE_ACTS.length; i++) {
      if (!done.includes(VOYAGE_ACTS[i].id) && reached(i)) {
        ctx.ui.modeToast?.(
          tt({ zh: '故事新的一页展开了…', en: 'A new page of the story unfolds…' })
        );
        openAct(i);
        break;
      }
    }
  }

  return defineSystem({
    name: 'voyageScenes',
    layer: 'presentation',
    phase: 'ui',
    init() {
      probeBase();
      done = readDone();
      window.addEventListener('script:lang', onLang);
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.id = 'voyageScenes';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.style.zIndex = String(Z.voyageScene);
      root.innerHTML = `
        <iframe class="vs-frame" title="星之旅程场景" allow="autoplay"></iframe>
        <div class="vs-bar"><span class="vs-title"></span><span class="vs-sub"></span>
          <span class="vs-spacer"></span><button class="vs-exit">✕ 回到故事</button></div>
        <div class="vs-cap"><div class="vs-line"></div><div class="vs-acts"></div></div>`;
      document.body.appendChild(root);
      frame = root.querySelector('.vs-frame');
      api = ctx.overlay.register(root, {
        display: 'flex',
        closeOnOutside: false,
        x: '.vs-exit',
        onClose: () => {
          frame.src = 'about:blank'; // 释放场景渲染器与监听
        },
      });
      entry = document.createElement('button');
      entry.id = 'vsEntry';
      entry.textContent = '✦';
      entry.style.zIndex = String(Z.hudBtn);
      entry.onclick = () => {
        done = readDone();
        refreshEntry();
        // 回顾:从第一个"已经历且未看"的幕开始;都看完则从头
        let next = VOYAGE_ACTS.findIndex((a, i) => reached(i) && !done.includes(a.id));
        if (next < 0) next = VOYAGE_ACTS.findIndex((a, i) => reached(i));
        if (next < 0) {
          ctx.ui.modeToast?.(tt(VOYAGE_ACTS[0].hint));
          return;
        }
        openAct(next);
      };
      document.body.appendChild(entry);
      refreshEntry();
      // 故事信号:B612 到访 / 狐狸驯养完成(其余靠 tick 读存档)
      offWorld = ctx.events.on('world:changed', ({ to }) => {
        if (to === 'b612') {
          seenB612 = true;
          try {
            ctx.store.mark('voyageB612');
          } catch (e) {}
        }
      });
      offFox = ctx.events.on('fox:rite', () => {
        /* tick 会读 foxRite.days 判定 */
      });
      // 「B612 的一天」结算消息(同源 iframe):成绩写进同一份 voyageScenes 存档
      onGameMsg = (e) => {
        const d = e.data;
        if (
          !d ||
          d.type !== 'b612-game' ||
          e.origin !== location.origin ||
          !frame ||
          e.source !== frame.contentWindow
        )
          return;
        const score = Math.max(0, Number(d.score) || 0);
        if (score > gameBest) gameBest = score;
        if (d.win) gameWins++;
        writeDone();
        ctx.ui.modeToast?.(
          tt({
            zh: d.win
              ? '你守住了 B612！' + score + ' 分'
              : '这一天没守住…' + score + ' 分，明天再来。',
            en: d.win
              ? 'You kept B612! ' + score + ' pts'
              : 'The day was lost… ' + score + ' pts. Try tomorrow.',
          })
        );
        if (gameMode) renderCap();
      };
      window.addEventListener('message', onGameMsg);
      offTick = ctx.onTick(storyTick);
      ctx.ui.voyageScenes = {
        open: () => entry.onclick(),
        openAct,
        close: () => api.close(),
      };
    },
    dispose() {
      window.removeEventListener('script:lang', onLang);
      if (onGameMsg) window.removeEventListener('message', onGameMsg);
      if (offWorld) offWorld();
      if (offFox) offFox();
      if (offTick) offTick();
      api?.unregister();
      root?.remove();
      entry?.remove();
      style?.remove();
      ctx.ui.voyageScenes = null;
    },
  });
}
