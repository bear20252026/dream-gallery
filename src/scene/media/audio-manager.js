// audio-manager.js — 统一音频管理器 + TTS 昆仑开口 + HTML5 背景音乐
import { ctx } from '../../ctx.js';
import { onMediaChanged } from '../../media-push.js'; // 服务端主动推送:后台增删音乐即刷新(2026-08-29)
// 惰性读取 aB:scene.js 在 main.js 第 6 行已执行,vault['aB'] 已填充;
// 不做顶层解构,直接在事件回调里读 ctx.scene.aB,防御打包器重排。

// ===================== 昆仑灵鉴:氛围小字 =====================
const skyNote = document.createElement('div');
skyNote.id = 'skyNote'; // 多世界切割:主世界专属语录,切世界由 scene-manager 统一隐藏
skyNote.textContent = 'B612 在这里等你。你来了，星星就亮了。';
skyNote.style.cssText =
  'position:fixed;right:12px;bottom:12px;z-index:15;color:rgba(255,200,220,0.35);font-size:10px;letter-spacing:2px;pointer-events:none;font-family:inherit';
document.body.appendChild(skyNote);

// ===================== TTS:昆仑开口 =====================
const KUNLUN_VOICES = {
  spirits: 'zh-CN-XiaoxiaoNeural',
  ark: 'zh-CN-YunxiNeural',
  hall: 'zh-CN-XiaoyiNeural',
  title: 'zh-CN-YunyangNeural',
};
function kunlunSpeak(text, voice, onEnd) {
  try {
    if (!text) return;
    let v = '';
    if (typeof voice === 'string' && voice) {
      v = KUNLUN_VOICES[voice] || voice;
    }
    const url =
      '/api/tts?text=' + encodeURIComponent(text) + (v ? '&voice=' + encodeURIComponent(v) : '');
    const a = new Audio(url);
    if (ctx.media.audioManager) {
      ctx.media.audioManager.playHint(a, onEnd);
    } else {
      a.play().catch(() => {
        if (onEnd) onEnd();
      });
    }
  } catch (e) {
    if (onEnd) onEnd();
  }
}

// 开场欢迎语(2026-09-01 重做防重复):
//   旧实现 sessionStorage + once:true 有两个洞:
//   ① 源文本「昆」字节损坏(乱码),TTS 一直读残缺文案;② 用户浏览器 sessionStorage
//      被清(严格隐私设置/无痕分区)时标记丢失,欢迎语反复重播
//   新实现:页面内内存幂等 + localStorage 24h 窗口双保险,常驻监听但早期返回,不会重复
let welcomeSpokenThisPage = false;
document.addEventListener('click', function () {
  if (welcomeSpokenThisPage) return;
  welcomeSpokenThisPage = true;
  let last = 0;
  try {
    last = parseInt(localStorage.getItem('kunlunWelcomed') || '0', 10) || 0;
  } catch (e) {}
  const now = Date.now();
  if (now - last < 24 * 3600 * 1000) return; // 24 小时内已欢迎过,不再播
  try {
    localStorage.setItem('kunlunWelcomed', String(now));
  } catch (e) {}
  // 用 click 而非 pointerdown,避免消费手势导致画廊音乐 play() 被拦截
  ctx.ui.kunlunSpeak && ctx.ui.kunlunSpeak('Welcome to B612 — a gallery for unfinished drawings.');
});

ctx.ui.kunlunSpeak = kunlunSpeak;

// ===================== 背景音乐(HTML5 Audio) =====================
let mA = new Audio(),
  mOn = false,
  mAReady = false,
  mIdx2 = 0,
  others = [],
  musicEndedBound = false;
// 同步音乐列表:后台新增/删除音乐后,游戏内播放列表随轮换实时跟随(不中断播放链)
function refreshMusicList() {
  fetch('/api/files?dir=music')
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      others = (d.music || [])
        .map(function (f) {
          return f.url;
        })
        .filter(function (u) {
          return u !== '/music/background.mp3';
        });
    })
    .catch(function () {});
}
function ensureMusic() {
  if (mAReady) return;
  mAReady = true;
  mA.src = 'music/background.mp3';
  mA.loop = true;
  mA.volume = 0.5;
  mA.preload = 'auto';
  refreshMusicList();
  if (!musicEndedBound) {
    musicEndedBound = true;
    mA.addEventListener('ended', function () {
      if (!others.length) {
        // 列表被清空:回到循环背景乐
        mA.loop = true;
        mA.src = 'music/background.mp3';
        mA.play().catch(function () {});
        return;
      }
      mA.loop = false;
      mA.src = others[mIdx2 % others.length];
      mIdx2++;
      mA.play().catch(function () {});
    });
  }
  // 每 60s 同步一次音乐列表(轻量,后台增删音乐无需刷新页面即进入轮换)
  setInterval(refreshMusicList, 60000);
  // 服务端主动推送:后台增删音乐 → 立即刷新列表(不等轮询)
  onMediaChanged(function (d) {
    if (d && d.dir === 'music') refreshMusicList();
    else if (d) refreshMusicList(); // 增删 photos/videos 不影响音乐,但保底刷新一次无妨
  });
}
setTimeout(function () {
  ctx.scene.aB.addEventListener('click', () => {
    ensureMusic();
    const _aB = ctx.scene.aB;
    if (!mOn) {
      mA.play()
        .then(() => {
          mOn = true;
          _aB.textContent = '音乐播放中';
          _aB.classList.add('p');
        })
        .catch((e) => {
          alert('音乐播放失败: ' + ((e && e.name) || e) + '\n请把这条提示告诉开发者');
        });
    } else {
      if (mA.paused) {
        mA.play();
        _aB.textContent = '音乐播放中';
        _aB.classList.add('p');
      } else {
        mA.pause();
        _aB.textContent = '音乐已暂停';
        _aB.classList.remove('p');
      }
    }
  });
});

ctx.media.mA = mA;

// 多世界切割(2026-09-06):非主世界暂停画廊 BGM(避免与小世界配乐叠音),回主世界恢复原状态
let bgmWasPlaying = false;
ctx.scene.worldChanged &&
  ctx.scene.worldChanged(function (d) {
    if (!d || d.to === 'main') {
      if (bgmWasPlaying && mA.paused) mA.play().catch(function () {});
    } else {
      bgmWasPlaying = !mA.paused;
      if (bgmWasPlaying) mA.pause();
    }
  });

// 诊断钩子
window.__vidEl = ctx.media.vidEl;
window.__v45El = ctx.media.v45El;

// ===================== 统一音频管理器 =====================
const audioManager = {
  videoSound: null,
  hintSound: null,
  hintQueue: [],
  isHintPlaying: false,
};
audioManager.registerVideo = function (el) {
  if (el) audioManager.videoSound = el;
};
audioManager.unregisterVideo = function (el) {
  if (audioManager.videoSound === el) audioManager.videoSound = null;
};
audioManager.playHint = function (audio, onEnd) {
  const doPlay = () => {
    audioManager.hintSound = audio;
    audioManager.isHintPlaying = true;
    const finish = () => {
      audioManager.hintSound = null;
      audioManager.isHintPlaying = false;
      if (onEnd) onEnd();
      if (audioManager.hintQueue.length > 0) {
        const next = audioManager.hintQueue.shift();
        doPlay();
      }
    };
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    audio.play().catch(finish);
  };
  if (audioManager.isHintPlaying) {
    audioManager.hintQueue.push({ audio, onEnd });
  } else {
    doPlay();
  }
};
audioManager.pauseAll = function () {
  if (audioManager.videoSound && !audioManager.videoSound.paused) audioManager.videoSound.pause();
  if (audioManager.hintSound && !audioManager.hintSound.paused) audioManager.hintSound.pause();
};
audioManager.resumeAll = function () {
  if (audioManager.videoSound && audioManager.videoSound.paused)
    audioManager.videoSound.play().catch(() => {});
  if (audioManager.hintSound && audioManager.hintSound.paused)
    audioManager.hintSound.play().catch(() => {});
};

ctx.media.audioManager = audioManager;
