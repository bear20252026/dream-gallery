// kunlun/ending-style.js — 结局线界面样式(2026-11-11 巨型文件拆分:从 ending-journey.js 抽离)
// 纯 CSS 模板,只依赖 z-layers 的 Z;无副作用、无闭包状态。ending-journey 在 init 时把它注入 <style>。
// 抽离原则:逐字搬运,不改任何选择器/数值/动画,运行期产物与原先逐字节一致。
import { Z } from '../shared/z-layers.mjs';

export const ENDING_STYLE = `
#endAction{position:fixed;left:50%;bottom:31vh;transform:translateX(-50%);z-index:${Z.endingAction};
  display:none;align-items:center;gap:12px;padding:10px 12px 10px 20px;border-radius:30px;
  background:rgba(30,24,18,.86);border:1px solid rgba(232,200,140,.55);color:#f6e6c4;
  font-family:Georgia,"Kaiti SC","STKaiti","KaiTi",serif;box-shadow:0 10px 30px rgba(0,0,0,.35);
  animation:endPulse 2.6s ease-in-out infinite}
#endAction.show{display:flex}
#endAction button{font:inherit;font-size:16px;cursor:pointer;color:#2c2014;background:linear-gradient(135deg,#f3d79a,#d7a65a);
  border:none;border-radius:22px;padding:10px 20px;min-height:44px;white-space:nowrap}
#endAction kbd{font:12px/1 sans-serif;opacity:.65;border:1px solid rgba(246,230,196,.5);border-radius:5px;padding:4px 6px}
@keyframes endPulse{0%,100%{box-shadow:0 10px 30px rgba(0,0,0,.35)}50%{box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 0 6px rgba(243,215,154,.14)}}
#endListen{position:fixed;inset:0;z-index:${Z.endingTint};pointer-events:none;display:none}
#endListen.show{display:block}
#endListen .ed{position:absolute;top:0;bottom:0;width:28vw;opacity:0;transition:opacity .35s ease}
#endListen .el{left:0;background:radial-gradient(60% 70% at 0% 50%,rgba(150,205,255,.55),rgba(150,205,255,0) 70%)}
#endListen .er{right:0;background:radial-gradient(60% 70% at 100% 50%,rgba(150,205,255,.55),rgba(150,205,255,0) 70%)}
#endListen .eb{left:0;right:0;bottom:0;top:auto;width:auto;height:26vh;background:radial-gradient(70% 90% at 50% 100%,rgba(150,205,255,.45),rgba(150,205,255,0) 70%)}
#endListen .ring{position:absolute;left:50%;top:50%;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;
  border:1.5px solid rgba(190,225,255,.8);opacity:0}
#endListen .lab{position:absolute;left:50%;top:22vh;transform:translateX(-50%);font:italic 15px Georgia,serif;
  color:rgba(220,236,255,.9);letter-spacing:.12em;text-shadow:0 1px 6px rgba(0,0,0,.6);opacity:0;transition:opacity .5s}
#endTint{position:fixed;inset:0;z-index:${Z.endingTint};pointer-events:none;opacity:0;transition:opacity 1.2s ease}
#endVeil{position:fixed;inset:0;z-index:${Z.endingStage};display:none;align-items:center;justify-content:center;
  background:#07060a;color:#efe2c6;font:italic clamp(20px,3vw,30px) Georgia,serif;letter-spacing:.14em;opacity:0;transition:opacity 1.4s ease}
#endVeil.show{display:flex}
#endSketch{position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);z-index:${Z.bookPages};display:none;
  width:min(380px,84vw);padding:18px 18px 10px;background:#f6eedb;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#endSketch.show{display:block}
#endSketch svg{width:100%;height:auto;fill:none;stroke:#4a3a2a;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
#endSketch svg .faint{stroke:#9b8a72;stroke-width:1.4}
#endSketch svg path{stroke-dasharray:700;stroke-dashoffset:700;animation:endDraw 2.4s ease forwards}
@keyframes endDraw{to{stroke-dashoffset:0}}
#endStage{position:fixed;inset:0;z-index:${Z.endingStage};display:none;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 100%,#1b2140 0%,#0b0d1c 55%,#05060c 100%);
  font-family:Georgia,"Times New Roman","Kaiti SC","STKaiti","KaiTi",serif;color:#f1e6cc;opacity:0;transition:opacity 2s ease}
#endStage.show{display:block}
#endStage.in{opacity:1}
#endStage canvas{position:absolute;inset:0;width:100%;height:100%}
#endStage .cap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,86vw);text-align:center}
#endStage .kick{font-size:12px;letter-spacing:.4em;color:#c9b07c;text-transform:uppercase;margin-bottom:18px}
#endStage .txt{font-size:clamp(17px,2.2vw,23px);line-height:1.75;white-space:pre-line;opacity:0;transition:opacity 1.4s ease}
#endStage .txt2{font-size:13px;line-height:1.6;color:#a99c86;white-space:pre-line;margin-top:12px;opacity:0;transition:opacity 1.4s ease}
#endStage .txt.on,#endStage .txt2.on{opacity:1}
#endStage .sk{width:min(240px,50vw);margin:0 auto 14px;opacity:.9}
#endStage .sk svg{width:100%;height:auto;fill:none;stroke:#e8d9b6;stroke-width:2.2;stroke-linecap:round}
#endStage .sk svg .faint{stroke:#8f8572}
#endStage .own{width:min(260px,56vw,40dvh);margin:0 auto 14px;padding:8px;background:#f1e7cc;border-radius:3px 14px;transform:rotate(-1.2deg);box-shadow:0 10px 30px #0008}
#endStage .own-note{font-size:13px;line-height:1.5;color:#cdbfa6;text-align:center;margin:0 auto 12px;max-width:min(360px,80vw)}
#endStage .pf-strip{display:flex;justify-content:center;gap:10px;margin:0 auto 14px;flex-wrap:wrap}
#endStage .pf-strip button{width:min(84px,20vw);padding:4px;background:#f1e7cc;border:0;border-radius:3px 10px;cursor:pointer;transform:rotate(-1deg)}
#endStage .pf-strip button:nth-child(even){transform:rotate(1.2deg)}
#endStage .btns{margin-top:28px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;opacity:0;transition:opacity 1s ease}
#endStage .btns.on{opacity:1}
#endStage button{font:inherit;font-size:16px;cursor:pointer;color:#f6e6c4;background:rgba(255,236,190,.08);
  border:1px solid rgba(240,214,160,.55);border-radius:24px;padding:10px 24px;min-height:44px}
#endStage button:hover{background:rgba(255,236,190,.18)}
#endStage button.hill{color:#2c2014;background:linear-gradient(135deg,#f3d79a,#d7a65a);border-color:#f3d79a;flex-basis:100%;max-width:max-content;margin:0 auto}
#endStage button.hill:hover{background:linear-gradient(135deg,#f7e2b2,#e0b46c)}
#endStage .end{font-size:clamp(34px,6vw,64px);letter-spacing:.3em;font-weight:400;margin:6px 0 4px}
#endStage .hint{position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:12px;color:#7d7564;letter-spacing:.2em}
@media (hover:none),(max-width:600px){#endAction kbd{display:none}#endAction{padding:8px}}
@media (prefers-reduced-motion:reduce){#endAction{animation:none}#endSketch svg path{animation:none;stroke-dashoffset:0}}
`;
