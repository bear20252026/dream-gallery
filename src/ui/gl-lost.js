// ui/gl-lost.js — WebGL 失效时的友好提示页(2026-10-03 测试建议:不要白屏)
// 两种情况:①运行中显卡上下文被系统收回(手机内存吃紧/切后台/驱动重置)——旧做法是立刻
// location.reload(),玩家看到的是一闪白屏甚至反复刷新;②浏览器根本起不来 3D。
// 现在停在一张纸面提示上:说清发生了什么、进度没丢,给「继续」与「换流畅画质再继续」两个按钮。
// 上下文自己恢复(webglcontextrestored)时也只提示,不擅自刷新——由玩家决定。
import { ctx } from '../ctx.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';

const TEXT = {
  lost: {
    title: { zh: '画纸被风吹走了一下', en: 'The paper slipped for a moment' },
    body: {
      zh: '显卡暂时收回了画面(手机内存吃紧或切到后台时常见)。你的进度已经保存,点「继续」从刚才的地方接着走。',
      en: 'Your device took the graphics back for a moment (common when memory is low or the app went to the background). Your progress is saved — tap Continue to pick up where you were.',
    },
  },
  unsupported: {
    title: { zh: '这台设备没能打开 3D 画纸', en: 'This device could not open the 3D paper' },
    body: {
      zh: '浏览器没能启动 WebGL。可以试试:换用最新版 Chrome / Safari / Edge,打开浏览器设置里的「硬件加速」,或换一台设备。',
      en: 'Your browser could not start WebGL. Try the latest Chrome, Safari or Edge, turn on hardware acceleration in browser settings, or use another device.',
    },
  },
  again: { zh: '继续', en: 'Continue' },
  lighter: { zh: '换流畅画质再继续', en: 'Continue with lighter graphics' },
  saved: {
    zh: '进度会在每一段剧情后自动保存。',
    en: 'Progress saves itself after every part of the story.',
  },
};

const RECENT_KEY = 'b612GlLostAt'; // sessionStorage:短时间内反复丢失时,主推「流畅画质」

export function showGlLost(reason) {
  const kind = reason === 'unsupported' ? 'unsupported' : 'lost';
  if (typeof document === 'undefined' || document.getElementById('glLost')) return;
  let repeated = false;
  try {
    const prev = Number(sessionStorage.getItem(RECENT_KEY) || 0);
    repeated = kind === 'lost' && Date.now() - prev < 3 * 60 * 1000;
    sessionStorage.setItem(RECENT_KEY, String(Date.now()));
  } catch (e) {
    /* 隐私模式取不到也无妨 */
  }
  const d = document.createElement('div');
  d.id = 'glLost';
  d.setAttribute('role', 'alertdialog');
  d.setAttribute('aria-modal', 'true');
  d.style.cssText =
    'position:fixed;inset:0;z-index:' +
    Z.glLost +
    ';display:flex;flex-direction:column;gap:18px;align-items:center;justify-content:center;' +
    'background:radial-gradient(120% 90% at 50% 40%,#f8f1df,#eadfc2);color:#4e4237;' +
    'font-family:Georgia,"Kaiti SC","KaiTi",serif;text-align:center;padding:28px;box-sizing:border-box';
  const star = document.createElement('div');
  star.textContent = '✦';
  star.style.cssText = 'font-size:30px;color:#c9a35f';
  const t = document.createElement('h2');
  t.style.cssText = 'font-size:22px;letter-spacing:2px;margin:0;font-weight:400';
  t.textContent = tt(TEXT[kind].title);
  const s = document.createElement('p');
  s.style.cssText = 'font-size:15px;line-height:1.9;max-width:480px;margin:0;opacity:.85';
  s.textContent = tt(TEXT[kind].body);
  d.append(star, t, s);
  if (kind === 'lost') {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center';
    const btn = (label, primary, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = tt(label);
      b.style.cssText =
        'min-height:46px;padding:10px 26px;border-radius:24px;cursor:pointer;font:inherit;font-size:15px;letter-spacing:1px;' +
        (primary
          ? 'background:#6b5634;color:#fff0cc;border:1px solid #af9361'
          : 'background:transparent;color:#4e4237;border:1px solid rgba(90,72,50,.45)');
      b.onclick = fn;
      row.appendChild(b);
      return b;
    };
    const lighter = () => {
      try {
        ctx.store.setJson('lowQuality', true);
      } catch (e) {
        /* 存不进也照常刷新 */
      }
      location.reload();
    };
    // 反复丢失 = 设备扛不住当前画质:把「流畅画质」放在前面当主按钮
    const first = repeated
      ? btn(TEXT.lighter, true, lighter)
      : btn(TEXT.again, true, () => location.reload());
    if (repeated) btn(TEXT.again, false, () => location.reload());
    else btn(TEXT.lighter, false, lighter);
    d.appendChild(row);
    const note = document.createElement('small');
    note.style.cssText = 'font-size:12px;opacity:.6';
    note.textContent = tt(TEXT.saved);
    d.appendChild(note);
    setTimeout(() => first.focus(), 50);
  }
  document.body.appendChild(d);
}

/** 挂到渲染器画布上:丢失 → 提示页(阻止浏览器默认的放弃恢复) */
export function watchGlContext(canvas) {
  if (!canvas || !canvas.addEventListener) return;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showGlLost('lost');
  });
}
