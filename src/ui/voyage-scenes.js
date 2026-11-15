// voyage-scenes.js — 「星之旅程」四幕放映(2026-11-15)
// 主人提供的四个 voxel 场景(已入 public/voxel/)织入小王子单一叙事:
//   幕一 B612 家园与玫瑰 → 幕二 玫瑰园 → 幕三 狐狸与麦田 → 幕四 云海之鲤
// 形态:openfilm 式全屏放映覆盖层(同源 iframe 承载单文件场景,独立渲染器不碰主循环),
// 配叙事字幕与「继续旅程/重看此幕/回到沙漠」。进度存 voyageScenes(已登记 SCHEMA)。
// 入口:独立 HUD 圆钮「✦」(不改动被测试钉死的菜单 data-act 名单)。
// 生命周期:组合根 init/dispose 对称;iframe 关闭即摘(src 置空释放其渲染器与监听)。
import { ctx } from '../ctx.js';
import { Z } from '../shared/z-layers.mjs';
import { defineSystem } from '../core/system.js';
import { tt } from '../shared/story-text.mjs'; // 双语单一源:字幕/按钮跟随 scriptLang

// 四幕:标题/旁白/场景文件。旁白只走小王子一条叙事线。
// unlock: 主线章节(planetsChapter)达到该值后解锁,把四幕织进叙事进度;
// 第一幕始终开放(它是旅程的起点),后三幕随主线推进逐幕点亮。
export const VOYAGE_ACTS = [
  {
    id: 'b612',
    unlock: 0,
    file: '/voxel/b612.html',
    title: { zh: '第一幕 · 他的星球', en: 'Act I · His Planet' },
    sub: { zh: 'B612 · 三座火山与一朵玫瑰', en: 'B612 · three volcanoes and one rose' },
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
    id: 'rose',
    unlock: 1,
    file: '/voxel/rose.html',
    title: { zh: '第二幕 · 玫瑰园', en: 'Act II · The Rose Garden' },
    sub: {
      zh: '五千朵玫瑰，与独一无二的那一朵',
      en: 'Five thousand roses, and the one that is unique',
    },
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
    id: 'fox',
    unlock: 3,
    file: '/voxel/fox.html',
    title: { zh: '第三幕 · 狐狸与麦田', en: 'Act III · The Fox and the Wheat' },
    sub: { zh: '驯养 · 金黄色的麦子', en: 'Taming · the golden wheat' },
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
    id: 'koi',
    unlock: 5,
    file: '/voxel/koi.html',
    title: { zh: '第四幕 · 云海之鲤', en: 'Act IV · Koi of the Cloud Sea' },
    sub: { zh: '天空の鯉 · 带着花园去远方', en: 'Sky koi · carrying a garden afar' },
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

  function readDone() {
    try {
      const v = ctx.store.json('voyageScenes');
      return Array.isArray(v && v.done) ? v.done : [];
    } catch (e) {
      return [];
    }
  }
  function writeDone() {
    try {
      ctx.store.setJson('voyageScenes', { done });
    } catch (e) {}
    refreshEntry();
  }
  // 主线章节进度:四幕随 planetsChapter 逐幕解锁(织入叙事,而非孤立放映)
  function chapter() {
    try {
      return ctx.store.num('planetsChapter') || 0;
    } catch (e) {
      return 0;
    }
  }
  function unlocked(i) {
    return chapter() >= (VOYAGE_ACTS[i].unlock || 0);
  }
  function refreshEntry() {
    if (!entry) return;
    const n = done.length;
    entry.textContent = n >= VOYAGE_ACTS.length ? '✦' : '✧';
    entry.title = tt({
      zh: '星之旅程 · 已看 ' + n + '/' + VOYAGE_ACTS.length + ' 幕',
      en: 'Star voyage · ' + n + '/' + VOYAGE_ACTS.length + ' acts',
    });
    entry.setAttribute('aria-label', tt({ zh: '打开星之旅程', en: 'Open the star voyage' }));
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
    if (exitB) exitB.textContent = '✕ ' + tt({ zh: '回到沙漠', en: 'Back to the desert' });
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
      if (actIdx < VOYAGE_ACTS.length - 1) {
        if (unlocked(actIdx + 1)) {
          mk(tt({ zh: '继续旅程 ›', en: 'Continue ›' }), 'primary', () => openAct(actIdx + 1));
        } else {
          mk(tt({ zh: '下一幕随主线解锁', en: 'Next act unlocks with the story' }), '', () =>
            ctx.ui.modeToast?.(
              tt({
                zh: '继续主线旅程，下一幕就会为你点亮。',
                en: 'Continue the story to light the next act.',
              })
            )
          );
        }
      } else {
        // 终幕结语:四幕走完,把旅程收束回小王子的一句话
        line.textContent = tt({
          zh: '四幕走完。星星发亮，是为了让每一个人有一天都能找到属于自己的星星。',
          en: 'The four acts are done. The stars shine so that one day everyone may find their own.',
        });
        mk(
          tt({ zh: '旅程完成 · 回到沙漠', en: 'Journey complete · back to the desert' }),
          'primary',
          () => api.close()
        );
      }
    }
    mk(tt({ zh: '重看此幕', en: 'Replay act' }), '', () => openAct(actIdx));
    mk(tt({ zh: '回到沙漠', en: 'Back to the desert' }), '', () => api.close());
    // 幕次小圆点:●当前 ✦已看 ○未看 🔒未解锁
    const dots = document.createElement('span');
    dots.style.cssText = 'align-self:center;color:#c3b9cf;font-size:12px;margin-left:6px';
    dots.textContent = VOYAGE_ACTS.map((a, i) =>
      i === actIdx ? '●' : done.includes(a.id) ? '✦' : unlocked(i) ? '○' : '🔒'
    ).join(' ');
    acts.appendChild(dots);
  }
  // 场景文件在 public/voxel/:vite 构建后落在 /voxel/,dev 服务器根=仓库根则需 /public/voxel/。
  // 开机探测一次,两种环境都稳(不硬编码单一路径)。
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
  // 语言切换即时重绘字幕/按钮(与 openfilm 同口径)
  function onLang() {
    if (api && api.isOpen()) renderCap();
    refreshEntry();
  }
  function openAct(i) {
    actIdx = Math.max(0, Math.min(VOYAGE_ACTS.length - 1, i));
    if (!unlocked(actIdx)) {
      ctx.ui.modeToast?.(
        tt({
          zh: '这一幕还没点亮——先继续主线旅程吧。',
          en: 'This act is not lit yet — continue the story first.',
        })
      );
      return;
    }
    lineIdx = 0;
    const act = VOYAGE_ACTS[actIdx];
    frame.src = base + act.file.split('/').pop(); // 同源单文件场景;独立渲染器,不碰主循环
    renderCap();
    api.open();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  return defineSystem({
    name: 'voyageScenes',
    layer: 'presentation',
    phase: 'ui',
    init() {
      probeBase();
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
          <span class="vs-spacer"></span><button class="vs-exit">✕ 回到沙漠</button></div>
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
      entry.title = '星之旅程 · 四幕';
      entry.setAttribute('aria-label', '打开星之旅程');
      entry.textContent = '✦';
      entry.style.zIndex = String(Z.hudBtn);
      entry.onclick = () => {
        done = readDone();
        refreshEntry();
        // 从第一个"已解锁且未看"的幕开始;都看完则从头重看
        let next = VOYAGE_ACTS.findIndex((a, i) => unlocked(i) && !done.includes(a.id));
        if (next < 0) next = 0;
        openAct(next);
      };
      document.body.appendChild(entry);
      refreshEntry();
      ctx.ui.voyageScenes = {
        open: () => entry.onclick(),
        openAct,
        close: () => api.close(),
      };
    },
    dispose() {
      window.removeEventListener('script:lang', onLang);
      api?.unregister();
      root?.remove();
      entry?.remove();
      style?.remove();
      ctx.ui.voyageScenes = null;
    },
  });
}
