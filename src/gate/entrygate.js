// entrygate.js — B612 入口闸门(2026-09-05 定稿;2026-09-06 主人定重构)
// 结构借自 Chartogne-Taillet 入口(标题+一句话+Enter+底部协议小字),皮肤用本作"纸与墨"语言。
// - **每次进入都显示**(主人 2026-09-06 定:闸门是开场第一屏,不再按 gateEntered 跳过)。
// - 底部一行:勾选一个「同意」+ 三个协议名字。
//   **2026-09-23(P1-1)起:三个名字点开的是并列三协议面板**,不是三次整页跳转 ——
//   见 gate/agreement-swipe.js。三份在同一面板内切换、各自勾选,签毕返回闸门,**全程零 reload**。
// - 勾选后 ENTER 才可用;点 ENTER 写 3 个会话标记(下游大屏轮播/指引卡只认会话键)。
//   取代 2026-07-27 的三连读强制签署。
import { ctx } from '../ctx.js';
import * as bootState from '../core/boot-state.js';
import { Z } from '../shared/z-layers.mjs';
import { GLOBAL, tt } from '../shared/story-text.mjs';
import { makeLangToggle } from '../ui/lang-toggle.js';
import { spawnAgreementPages } from './agreement-swipe.js';

// 三连协议会话签名(2026-09-18 自 main.js 外迁):闸门 60s 超时/初始化失败时放行用。
// 会话级键不进 store(存档规矩:sessionStorage 不登记)。
// 2026-09-23(P1-1):此处原有一份重复定义,与 gate/consent-session.js 逐字相同但无人引用
// —— 已删,统一走 consent-session.js 单一来源。见 entrygate.js 的 signAllConsents 改用 import。
import { signAllConsents } from './consent-session.js';

export function setupEntryGate(opts) {
  opts = opts || {};
  // 审计 P1-R2:引导期 60s 超时已放行的话,迟到的闸门不再构建
  if (bootState.get('gateFailed')) return;
  build(opts);
}

function build(opts) {
  let entered = false; // 已点 ENTER(终态:闸门退役,不再恢复)
  const ov = document.createElement('div');
  ov.id = 'b612Gate';
  const renderLang = () => {
    const d = ov.querySelector('#gDed');
    if (d) d.textContent = tt(GLOBAL.gateDedication);
  };
  ov.innerHTML = `
  <svg class="gOrn" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <circle cx="50" cy="46" r="34" fill="none" stroke="rgba(90,72,50,.30)" stroke-width=".18" stroke-dasharray="1.2 1.6"/>
    <circle cx="50" cy="46" r="40" fill="none" stroke="rgba(90,72,50,.18)" stroke-width=".12" stroke-dasharray=".4 1.4"/>
    <g stroke="rgba(122,102,74,.5)" stroke-width=".22">
      <line x1="91" y1="46" x2="97" y2="46"/><line x1="50" y1="8" x2="50" y2="13"/>
    </g>
  </svg>
  <div class="gInner">
    <div class="gEyebrow">T H E&#8194;D E S E R T</div>
    <h1 class="gTitle">B612</h1>
    <div class="gScript">a gallery for unfinished drawings</div>
    <div class="gPoem">Here memories are kept — and farewells too.<br>Every unfinished drawing waits for someone.</div>
    <div class="gDed" id="gDed"></div>
    <button class="gEnter" type="button">E N T E R<span class="gBar"></span></button>
  </div>
  <div class="gLegal">
    <label class="gAgree">
      <input type="checkbox" id="gAgreeChk">
      <span>I have read and agree to the</span>
      <a data-doc="agreement.html" href="javascript:void(0)">Terms of Service</a> ·
      <a data-doc="privacy.html" href="javascript:void(0)">Privacy Policy</a> ·
      <a data-doc="community.html" href="javascript:void(0)">Community Guidelines</a>
    </label>
    <br>© 2026 B612 · Revised Sep 5, 2026
  </div>
  <style>
  @import url('https://fonts.googleapis.com/css2?family=Satisfy&display=swap');
  #b612Gate{position:fixed;inset:0;z-index:${Z.gate};display:flex;align-items:center;justify-content:center;
    font-family:Georgia,'Times New Roman',serif;transition:opacity 1.2s ease;overflow:hidden;
    background:
      repeating-linear-gradient(63deg, rgba(90,72,50,.028) 0 1px, transparent 1px 9px),
      repeating-linear-gradient(-57deg, rgba(90,72,50,.024) 0 1px, transparent 1px 11px),
      radial-gradient(120% 90% at 50% 40%, #f8f1df 0%, #f3ead2 55%, #eadfc2 100%);}
  #b612Gate .gOrn{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  #b612Gate .gDed{margin-top:18px;font-style:italic;font-size:clamp(12px,1.6vw,15px);color:#8a7a62;line-height:1.8;white-space:pre-line}
  #b612Gate .gInner{position:relative;text-align:center;padding:0 20px;max-width:92vw}
  #b612Gate .gEyebrow{letter-spacing:.62em;font-size:clamp(12px,1.4vw,16px);color:#8a7a62;margin-bottom:16px}
  #b612Gate .gTitle{margin:0;font-weight:400;font-size:clamp(64px,11vw,118px);letter-spacing:.16em;color:#3f3529;line-height:1.05}
  #b612Gate .gScript{font-family:'Satisfy',cursive;color:#8a6a4a;font-size:clamp(18px,2.6vw,28px);margin-top:8px}
  #b612Gate .gPoem{margin:7vh 0 6vh;color:#54463a;font-size:clamp(15px,2vw,22px);letter-spacing:.12em;line-height:2.1}
  #b612Gate .gEnter{font-family:Georgia,serif;font-size:clamp(18px,2.2vw,26px);letter-spacing:.5em;
    color:#a04a35;background:none;border:none;cursor:pointer;padding:6px 12px;opacity:.22;
    transition:opacity .4s ease;pointer-events:none}
  #b612Gate .gEnter.ready{opacity:1;pointer-events:auto}
  #b612Gate .gEnter:hover{color:#7c3421}
  #b612Gate .gBar{display:block;width:1px;height:26px;margin:10px auto 0;background:#a04a35;
    animation:gBlink 1.6s ease-in-out infinite}
  @keyframes gBlink{0%,100%{opacity:1}50%{opacity:.15}}
  #b612Gate .gLegal{position:absolute;left:0;right:0;bottom:26px;text-align:center;
    color:rgba(84,70,58,.55);font-size:13px;letter-spacing:.08em;line-height:2}
  #b612Gate .gAgree{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
  #b612Gate .gAgree input{accent-color:#a04a35;width:15px;height:15px;cursor:pointer;flex:none}
  #b612Gate .gLegal a{color:#7a5c3e;text-decoration:none;border-bottom:1px dotted rgba(122,102,74,.6);
    cursor:pointer;margin:0 4px}
  #b612Gate .gLegal a:hover{color:#4e4237;border-bottom-style:solid}
  @media (max-width:640px){
    #b612Gate .gLegal{bottom:14px;padding:0 12px}
    #b612Gate .gAgree{flex-wrap:wrap;justify-content:center;row-gap:4px}
  }
  </style>`;
  document.body.appendChild(ov);
  renderLang();
  const langBtn = makeLangToggle({ placement: 'top:14px;right:14px', z: Z.gate + 1 });
  langBtn.style.position = 'fixed';
  ov.appendChild(langBtn);
  window.addEventListener('script:lang', renderLang);
  if (opts.onGateReady) opts.onGateReady(); // 加载屏就此交接(避免固定延时造成的空白间隙)

  const chk = ov.querySelector('#gAgreeChk');
  const enterBtn = ov.querySelector('.gEnter');
  // 勾选「同意」后 ENTER 才点亮(2026-09-06 主人定:单勾选 + 三协议可单独展开)
  chk.addEventListener('change', function () {
    enterBtn.classList.toggle('ready', chk.checked);
  });

  // ENTER=同意:写齐标记,揭幕,把开场配乐交给主流程
  enterBtn.onclick = function () {
    if (!chk.checked) return;
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    ctx.store.mark('gateEntered');
    entered = true;
    ov.style.opacity = '0';
    ov.style.pointerEvents = 'none';
    setTimeout(function () {
      ov.remove();
    }, 1300);
    if (opts.onEnter) opts.onEnter();
  };

  // 底行协议(P1-1,2026-09-23 重写):点开的是**并列三协议面板**,在同一面板内三标签切换,
  // 每份各自勾选,签毕返回闸门。全程零 reload —— 旧实现是三次整页跳转(agreement→privacy→
  // community),收尾还 parent.location.reload() 把整个世界推倒重来,是开场耗时的大头。
  // 三份都签完后面板自动把闸门底部的总勾选框勾上并点亮 ENTER,用户少点一次。
  const swipe = spawnAgreementPages(ov, {
    z: Z.gate + 50,
    // 打开面板时闸门暂隐(面板本身是全屏遮罩,叠着看两套 UI 会乱)
    onHide: function () {
      ov.style.opacity = '0';
      ov.style.pointerEvents = 'none';
    },
    // 面板关闭(三份读完 / 「‹ 返回闸门」/ Esc)后闸门恢复显示,已签状态不丢
    onRestore: function () {
      if (entered) return;
      // 2026-09-24 修"闪一下真画廊":面板是 display:none **瞬间消失**,而闸门若走
      // 1.2s 淡入,头几帧近乎全透明 → 底下已在渲染的 3D 世界直接闪出来。
      // → 恢复时跳过过渡,同一帧直接不透明回屏;ENTER 揭幕的淡出照旧(enterBtn 路径)。
      ov.style.transition = 'none';
      ov.style.opacity = '1';
      ov.style.pointerEvents = 'auto';
      void ov.offsetWidth; // 强制本帧应用,再交还过渡控制
      ov.style.transition = '';
    },
    // 三份签毕:闸门总勾选框自动勾上 + ENTER 点亮,用户直接点 ENTER 进场
    onAllSigned: function () {
      if (entered) return;
      chk.checked = true;
      enterBtn.classList.toggle('ready', true);
    },
  });
  void swipe;
}
