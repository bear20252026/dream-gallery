// entrygate.js — B612 入口闸门(2026-09-05 定稿)
// 结构借自 Chartogne-Taillet 入口(标题+一句话+Enter+底部协议小字),皮肤用本作"纸与墨"语言。
// - 首访:展示闸门;点 ENTER 即视为同意三份协议(写 3 个会话标记+永久标记);
//   协议全文从底行链接随时点开阅读(?from=gate 只读模式,左上「‹ 返回」退回闸门,状态不丢)。
// - 老访客(gateEntered):静默补齐会话标记(下游 watchOpening/昵称弹窗等只认会话键),永不再见闸门。
// 取代 2026-07-27 的三连读强制签署(主人 2026-09-05 定:三连读太折磨人)。
import { ctx } from '../ctx.js';

export function setupEntryGate(opts) {
  opts = opts || {};
  if (ctx.store.flag('gateEntered')) {
    // 老访客:会话键每次开页都要补(下游逻辑只认会话键)
    sessionStorage.setItem('agreementConsented', '1');
    sessionStorage.setItem('privacyConsented', '1');
    sessionStorage.setItem('communityConsented', '1');
    return;
  }
  if (
    sessionStorage.getItem('agreementConsented') &&
    sessionStorage.getItem('privacyConsented') &&
    sessionStorage.getItem('communityConsented')
  ) {
    ctx.store.mark('gateEntered'); // 本会话已从闸门进过(刷新):补永久标记即可
    return;
  }
  build(opts);
}

function build(opts) {
  let entered = false; // 已点 ENTER(终态:闸门退役,不再恢复)
  const ov = document.createElement('div');
  ov.id = 'b612Gate';
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
    <button class="gEnter" type="button">E N T E R<span class="gBar"></span></button>
  </div>
  <div class="gLegal">
    By entering you agree to our
    <a data-doc="agreement.html" href="javascript:void(0)">Terms of Service</a> ·
    <a data-doc="privacy.html" href="javascript:void(0)">Privacy Policy</a> ·
    <a data-doc="community.html" href="javascript:void(0)">Community Guidelines</a>
    <br>© 2026 B612 · Revised Sep 5, 2026
  </div>
  <style>
  @import url('https://fonts.googleapis.com/css2?family=Satisfy&display=swap');
  #b612Gate{position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;
    font-family:Georgia,'Times New Roman',serif;transition:opacity 1.2s ease;overflow:hidden;
    background:
      repeating-linear-gradient(63deg, rgba(90,72,50,.028) 0 1px, transparent 1px 9px),
      repeating-linear-gradient(-57deg, rgba(90,72,50,.024) 0 1px, transparent 1px 11px),
      radial-gradient(120% 90% at 50% 40%, #f8f1df 0%, #f3ead2 55%, #eadfc2 100%);}
  #b612Gate .gOrn{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  #b612Gate .gInner{position:relative;text-align:center;padding:0 20px;max-width:92vw}
  #b612Gate .gEyebrow{letter-spacing:.62em;font-size:clamp(12px,1.4vw,16px);color:#8a7a62;margin-bottom:16px}
  #b612Gate .gTitle{margin:0;font-weight:400;font-size:clamp(64px,11vw,118px);letter-spacing:.16em;color:#3f3529;line-height:1.05}
  #b612Gate .gScript{font-family:'Satisfy',cursive;color:#8a6a4a;font-size:clamp(18px,2.6vw,28px);margin-top:8px}
  #b612Gate .gPoem{margin:7vh 0 6vh;color:#54463a;font-size:clamp(15px,2vw,22px);letter-spacing:.12em;line-height:2.1}
  #b612Gate .gEnter{font-family:Georgia,serif;font-size:clamp(18px,2.2vw,26px);letter-spacing:.5em;
    color:#a04a35;background:none;border:none;cursor:pointer;padding:6px 12px}
  #b612Gate .gEnter:hover{color:#7c3421}
  #b612Gate .gBar{display:block;width:1px;height:26px;margin:10px auto 0;background:#a04a35;
    animation:gBlink 1.6s ease-in-out infinite}
  @keyframes gBlink{0%,100%{opacity:1}50%{opacity:.15}}
  #b612Gate .gLegal{position:absolute;left:0;right:0;bottom:26px;text-align:center;
    color:rgba(84,70,58,.55);font-size:13px;letter-spacing:.08em;line-height:2}
  #b612Gate .gLegal a{color:#7a5c3e;text-decoration:none;border-bottom:1px dotted rgba(122,102,74,.6);
    cursor:pointer;margin:0 4px}
  #b612Gate .gLegal a:hover{color:#4e4237;border-bottom-style:solid}
  </style>`;
  document.body.appendChild(ov);

  // ENTER=同意:写齐标记,揭幕,把开场配乐交给主流程
  ov.querySelector('.gEnter').onclick = function () {
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

  // 底行协议:点开只读(?from=gate),闸门暂隐;面板关闭(✕/Esc/‹返回)即回闸门,状态不丢
  ov.querySelectorAll('.gLegal a').forEach(function (a) {
    a.onclick = function (e) {
      e.preventDefault();
      if (!window.openPanel) {
        location.href = a.getAttribute('data-doc');
        return;
      }
      ov.style.opacity = '0';
      ov.style.pointerEvents = 'none';
      window.openPanel(a.getAttribute('data-doc') + '?from=gate', 'B612');
    };
  });
  if (window.closePanel) {
    const origClose = window.closePanel;
    window.closePanel = function () {
      origClose.apply(this, arguments);
      if (!entered) {
        // 读协议回来:闸门恢复(与 ENTER 终态分开,2026-09-05 修复自挡 bug)
        ov.style.opacity = '1';
        ov.style.pointerEvents = 'auto';
      }
    };
  }
}
