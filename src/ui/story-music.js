// ui/story-music.js — 剧情背景音乐(2026-10-03 主人提供五首曲目)
// 每 0.5 秒按剧情状态选一首(shared/story-music-logic.mjs pickCue),换场景时两条音轨交叉淡入淡出;
// 对白进行时压低音量(台词听得清);右下「音乐」钮 = 开/关(记在存档 musicOff)。
// 浏览器要求先有一次点击/按键才能出声:第一次手势(通常是闸门 ENTER)后才开始。
// 取代:旧的随机背景乐轮播(audio-manager 的 #ab)、闸门协议配乐、B612 的 GARGANTUA。
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { avAllowed } from '../core/av-switch.js';
import { i18nText, i18nAttr } from './i18n-dom.js';
import { CUES, pickCue, DUCK, FADE_S } from '../shared/story-music-logic.mjs';
import { endingReady } from '../shared/ending-logic.mjs';

const BASE = '/music/story/';

// —— 模块级单例:开机就挂好手势监听(闸门/电影阶段组合根还没装配,也要能起播) ——
let unlocked = false,
  current = null, // { id, el }
  fading = [], // [{ el, from, t }]
  btn = null,
  timer = null,
  last = 0;

const muted = () => !!ctx.store?.flag('musicOff') || !avAllowed('music');

function track(id) {
  const el = new Audio(BASE + CUES[id].file);
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  return el;
}
function targetVolume(id) {
  const duck = document.body.dataset.dialogOpen ? DUCK : 1;
  return CUES[id].volume * duck;
}
function switchTo(id) {
  if (current && current.id === id) return;
  if (current) fading.push({ el: current.el, from: current.el.volume, t: 0 });
  current = null;
  if (!id) return;
  const el = track(id);
  current = { id, el };
  el.play().catch(() => {
    /* 手势前被拦:下一次手势会重试 */
  });
}
function state() {
  const f = {
    world: ctx.scene?.activeWorld || 'main',
    scene2: !!ctx.store?.flag('scene2'),
    page1: !!ctx.store?.flag('page1'),
    chapter: ctx.store?.num('planetsChapter') || 0,
    endingStep: ctx.store?.num('endingStep') || 0,
    earthDay: !!ctx.store?.flag('earthDay'),
    flying: !!document.body.dataset.flying,
    epilogue: !!document.querySelector('#endStage.show'),
    opening: !!(document.getElementById('b612Gate') || document.getElementById('b612film')),
  };
  f.endingReady = endingReady(f);
  return f;
}
function labelButton() {
  if (!btn) return;
  const off = !!ctx.store.flag('musicOff');
  i18nText(
    btn,
    off ? { en: '♪ Music off', zh: '♪ 音乐已关' } : { en: '♪ Music on', zh: '♪ 音乐开' }
  );
  i18nAttr(
    btn,
    'aria-label',
    off ? { en: 'Turn music on', zh: '打开音乐' } : { en: 'Turn music off', zh: '关闭音乐' }
  );
  btn.setAttribute('aria-pressed', off ? 'false' : 'true');
  btn.classList.toggle('p', !off);
}
function tick(dt) {
  // 淡出旧曲
  fading = fading.filter((f) => {
    f.t += dt;
    const k = Math.max(0, 1 - f.t / FADE_S);
    f.el.volume = f.from * k;
    if (k <= 0) {
      f.el.pause();
      f.el.removeAttribute('src');
      f.el.load();
      return false;
    }
    return true;
  });
  if (!unlocked) return;
  switchTo(muted() ? null : pickCue(state()));
  if (current) {
    // 淡入 / 对白闪避:朝目标音量靠近(压低快一点,恢复慢一点)
    const goal = targetVolume(current.id);
    const v = current.el.volume;
    const step = (dt / FADE_S) * CUES[current.id].volume;
    current.el.volume = v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step * 1.5);
    if (current.el.paused) current.el.play().catch(() => {});
  }
}
/** 第一次点击/按键:解锁并立刻起播(仍在手势回调里,浏览器放行) */
export function startStoryMusic() {
  if (!unlocked) unlocked = true;
  if (!timer) {
    last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      tick(Math.min(0.5, (now - last) / 1000));
      last = now;
    }, 100);
  }
  tick(0.1);
}
if (typeof window !== 'undefined')
  for (const ev of ['pointerdown', 'keydown', 'touchstart'])
    window.addEventListener(ev, startStoryMusic, { capture: true, passive: true, once: true });

/** 右下「音乐」钮点一次:翻 musicOff 并立刻按新状态起/停(手势内,浏览器放行) */
function onMusicBtnClick(e) {
  e.stopImmediatePropagation();
  if (ctx.store.flag('musicOff')) ctx.store.unmark('musicOff');
  else ctx.store.mark('musicOff');
  labelButton();
  startStoryMusic();
}

// 监听器挂卸登记(2026-10-11 监听器族整改):此前 dispose 只停定时器/停音,不摘 click 与
// script:lang —— 二次 init 后一次点击跑多份 handler,mark/unmark 互抵,表现为「音乐按钮失灵」。
let clickHost = null; // 挂了 click 的元素
let langBound = false; // window 'script:lang' → labelButton 是否在挂状态
function wireButton(el) {
  unwireButton(); // 先摘上一轮:重复 init 也只剩一份 handler
  if (!el) return;
  el.addEventListener('click', onMusicBtnClick, { capture: true });
  clickHost = el;
  if (typeof window !== 'undefined') {
    window.addEventListener('script:lang', labelButton);
    langBound = true;
  }
}
function unwireButton() {
  if (clickHost) {
    clickHost.removeEventListener('click', onMusicBtnClick, true); // 与 add 的 capture 口径一致
    clickHost = null;
  }
  if (langBound && typeof window !== 'undefined') {
    window.removeEventListener('script:lang', labelButton);
    langBound = false;
  }
}
/** 组合根装配:接管右下「音乐」钮(开/关剧情音乐;旧的随机轮播已退役) + 探针钩子 */
export function createStoryMusic() {
  return defineSystem({
    name: 'storyMusic',
    layer: 'presentation',
    phase: 'ui',
    order: 12,
    init() {
      btn = document.getElementById('ab');
      if (btn) {
        wireButton(btn); // 可重复 init:旧 handler 先摘,只生效一份
        labelButton();
      }
      ctx.ui.storyMusic = {
        now: () => (current ? current.id : null),
        cue: () => pickCue(state()),
        // 探针用:当前音轨是否在放、音量、播到第几秒
        debug: () =>
          current
            ? {
                paused: current.el.paused,
                volume: +current.el.volume.toFixed(2),
                t: +current.el.currentTime.toFixed(1),
              }
            : null,
      };
    },
    dispose() {
      unwireButton(); // click / script:lang 随 dispose 一起摘(2026-10-11)
      if (timer) clearInterval(timer);
      timer = null;
      if (current) current.el.pause();
      fading.forEach((f) => f.el.pause());
      ctx.ui.storyMusic = null;
    },
  });
}
