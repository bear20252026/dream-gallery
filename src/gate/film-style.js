// film-style.js — 开场电影的 DOM 标记与样式(2026-09-20 自 openfilm.js 拆分,审计「大文件拆分」)
// 纯字符串常量模板,openfilm.js 组装容器。仅依赖 z-layers 登记册。
import { Z } from '../shared/z-layers.mjs';
export const FILM_MARKUP = `
  <style>
  @import url('https://fonts.googleapis.com/css2?family=Satisfy&display=swap');
  #b612film{position:fixed;inset:0;z-index:${Z.film};background:#0d0b09;overflow:hidden;
    font-family:'Satisfy',cursive;user-select:none}
  #b612film #fc{position:absolute;inset:0;opacity:0;transition:opacity 1.4s ease}
  #b612film.act2 #fc{opacity:1}
  #b612film #fFrame{position:absolute;inset:14px;border:1px solid rgba(90,72,50,.55);pointer-events:none;z-index:5;opacity:0;transition:opacity 1.4s ease}
  #b612film #fFrame::after{content:'';position:absolute;inset:5px;border:2px solid rgba(90,72,50,.25)}
  #b612film #fRose{position:absolute;right:30px;top:28px;width:64px;height:64px;z-index:6;pointer-events:none;opacity:0;transition:opacity 1.4s ease}
  #b612film.act2 #fFrame{opacity:1}#b612film.act2 #fRose{opacity:.55}
  #b612film #fDark{position:absolute;inset:0;background:#0d0b09;transition:opacity 1.6s ease;pointer-events:none;z-index:1}
  #b612film.act2 #fDark{opacity:0}
  #b612film #fPaper{position:absolute;left:50%;top:50%;translate:-50% -50%;width:min(94vw,940px);aspect-ratio:720/460;z-index:10;
    background:radial-gradient(120% 90% at 50% 40%, #f8f1df 0%, #f3ead2 55%, #eadfc2 100%);
    border-radius:3px;box-shadow:0 30px 80px rgba(0,0,0,.65),0 4px 18px rgba(0,0,0,.4);
    transform:rotate(-.5deg);opacity:0;transition:opacity 1.6s ease}
  #b612film #fPaper.show{opacity:1}
  #b612film #fCrease{position:absolute;left:50%;top:50%;translate:-50% -50%;width:min(94vw,940px);aspect-ratio:720/460;pointer-events:none;z-index:11}
  #b612film #fCrease line{opacity:0;transition:opacity .22s ease}
  #b612film #fSketch{position:absolute;inset:4% 2%}
  #b612film .ftline{white-space:pre-line;position:absolute;left:0;right:0;text-align:center;color:#54463a;opacity:0;transition:opacity 1.4s ease;pointer-events:none;text-shadow:0 0 1px rgba(90,76,58,.35)}
  #b612film #fT0{top:6%;font-size:clamp(18px,3vw,30px)}
  #b612film #fTq{top:7%;font-size:clamp(26px,4.4vw,48px);color:#463a2d}
  #b612film #fReply{top:7%;font-size:clamp(20px,3.2vw,36px)}
  #b612film #fMind{top:80%;font-size:clamp(15px,2.4vw,24px)}
  #b612film .show{opacity:1}
  #b612film #fChoice{position:absolute;left:0;right:0;top:14%;display:flex;gap:30px;justify-content:center;opacity:0;transition:opacity 1.2s ease;pointer-events:none}
  #b612film #fChoice.show{opacity:1;pointer-events:auto}
  #b612film #fChoice button{font-family:'Satisfy',cursive;font-size:clamp(16px,2.6vw,28px);color:#54463a;
    background:rgba(255,252,244,.55);border:1px solid rgba(122,102,74,.5);border-radius:4px;
    padding:6px 24px 10px;cursor:pointer;transition:all .3s}
  #b612film #fChoice button:hover{background:#fff;color:#2f261b;box-shadow:0 4px 14px rgba(90,70,40,.25)}
  #b612film #fPlaneDom{position:absolute;left:50%;top:50%;width:min(30vw,300px);transform:translate(-50%,-50%) rotate(-14deg);opacity:0;z-index:12;pointer-events:none;transition:opacity .8s ease}
  #b612film #fPlaneDom.show{opacity:1}
  #b612film .ffline{white-space:pre-line;position:fixed;left:0;right:0;text-align:center;color:#4e4237;z-index:14;opacity:0;transition:opacity 1.6s ease;pointer-events:none;text-shadow:0 1px 0 rgba(255,250,235,.5)}
  #b612film #tFly1{top:12%;font-size:clamp(20px,3.4vw,36px)}
  #b612film #tFly2{top:20%;font-size:clamp(17px,2.8vw,28px);color:rgba(78,66,55,.8)}
  #b612film #tLand{bottom:16%;font-size:clamp(18px,3vw,32px)}
  #b612film .ftshow{opacity:1 !important}
  #b612film #fEnd{position:absolute;left:0;right:0;bottom:7%;text-align:center;color:rgba(78,66,55,.55);font-size:16px;z-index:14;opacity:0;transition:opacity 1.6s ease}
#b612film #fSleep{position:absolute;left:0;right:0;top:40%;text-align:center;color:#f8f1df;font-size:clamp(16px,2.6vw,26px);line-height:1.9;letter-spacing:.04em;opacity:0;transition:opacity 1.2s ease;z-index:30;white-space:pre-line;padding:0 8vw;pointer-events:none}
  #b612film #fSleep.show{opacity:1}
    #b612film #fSkip{position:absolute;right:26px;bottom:24px;z-index:20;color:rgba(139,125,99,.75);background:none;
    border:none;border-bottom:1px dashed rgba(139,125,99,.5);cursor:pointer;font-family:'Satisfy',cursive;font-size:15px;pointer-events:auto}
  </style>
  <canvas id="fc"></canvas>
  <div id="fFrame"></div>
  <svg id="fRose" viewBox="0 0 64 64" fill="none" stroke="#6b5c48" stroke-width="1.2">
    <circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="3" fill="#6b5c48" stroke="none"/>
    <path d="M32,6 L36,26 L32,32 L28,26 Z" fill="#6b5c48" stroke="none"/>
    <path d="M32,58 L28,38 L32,32 L36,38 Z" fill="rgba(107,92,72,.4)" stroke="none"/>
    <path d="M6,32 L26,28 L32,32 L26,36 Z" fill="rgba(107,92,72,.4)" stroke="none"/>
    <path d="M58,32 L38,36 L32,32 L38,28 Z" fill="rgba(107,92,72,.4)" stroke="none"/>
  </svg>
  <div id="fDark"></div>
  <div id="fPaper">
    <svg id="fSketch" viewBox="0 0 720 460" fill="none" stroke-linecap="round" stroke-linejoin="round"></svg>
    <div class="ftline" id="fTq"></div>
    <div class="ftline" id="fReply"></div>
    <div class="ftline" id="fSleep"></div>
    <div id="fChoice">
      <button id="cHat" type="button">A Hat</button>
      <button id="cBoa" type="button">A Boa Constrictor</button>
    </div>
  </div>
  <div id="fCrease"><svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
    <line id="cl1" x1="50" y1="0" x2="0" y2="50" stroke="rgba(90,72,50,.55)" stroke-width=".45" vector-effect="non-scaling-stroke"/>
    <line id="cl2" x1="50" y1="0" x2="100" y2="50" stroke="rgba(90,72,50,.55)" stroke-width=".45" vector-effect="non-scaling-stroke"/>
    <line id="cl3" x1="50" y1="0" x2="50" y2="100" stroke="rgba(90,72,50,.55)" stroke-width=".45" vector-effect="non-scaling-stroke"/>
  </svg></div>
  <svg id="fPlaneDom" viewBox="0 0 300 160" fill="none" stroke="#cfc2a6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12,84 L288,20 L196,96 Z"/><path d="M196,96 L178,138 L150,102"/>
    <path d="M12,84 L150,102"/><path d="M96,64 C104,58 116,58 124,64" opacity=".55"/>
  </svg>
  <div class="ffline" id="tFly1"></div>
  <div class="ffline" id="tFly2"></div>
  <button id="fSkip" type="button">skip ▸</button>`;
