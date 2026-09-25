// agreement-swipe.js — 三协议并列铺开(P1-1,2026-09-23 建)
//
// 背景 / 为什么改:
//   旧流程是三页**串行跳转**——闸门点「Terms of Service」打开 agreement.html(iframe 面板),
//   读完点「同意并继续阅读《隐私保护指引》」→ location.href 换成 privacy.html →
//   再点「同意并进入画廊」→ community.html → 同意后 **parent.location.reload()** 整页刷新。
//   三个问题:
//     ① 三次整页导航 + 中间两个"同意"按钮,加起来能占 1~3 分钟,是"加载到可操控角色"耗时的大头;
//     ② 末尾 parent.location.reload() 会把整个画廊(含已加载的 3D 世界)推倒重来,
//        白等一次完整的 WebGL 初始化,还丢掉用户已填的昵称/进度;
//     ③ 三页各自维护一份 consent 判定逻辑,签收状态分散在三个文件里,难审计。
//
// 现在的做法:
//   **一页铺开 + 零 reload**。闸门底部那行「Terms of Service · Privacy Policy · Community Guidelines」
//   不再是三个跳转链接,而是**三个并列标签页**;用户读完当前那份、勾一下、切下一份,
//   三份都勾完即签毕返回闸门。全程留在同一个 iframe 面板里,关面板只关面板,
//   **不发任何 reload** —— 世界继续跑,不重来。
//   每份文档带 ?embed=1,文档自身的 consentBar / 返回按钮自动隐藏(见三份 html 的 embed 分支)。
//
// 为什么不是"三份合一页"(原 P1-1 描述):
//   三份文档合计 ~137KB / 数万字,纵向拼成一页会有 20+ 屏,用户要滑很久;
//   并列标签页把"读完三份"压缩成三次点击,比拼一页更快,也保住了每份文档的独立排版。
//   法律效力不变:勾选框仍在三份文档各一次,签收仍写原来三个 sessionStorage 键。
//
// 与既有实现的兼容:
//   guide-card.js / settings.js 读的是 sessionStorage 的三个 consent 键,本模块不改这套契约,
//   只把"什么时候写"收拢到这一处(每份勾选即写,收尾再统一补写一次防缺口)。
//   单份文档直开(agreement.html?from=gate)仍走原逻辑,本模块不接管。
import { GLOBAL, tt } from '../shared/story-text.mjs';

// 三份协议的顺序与文案键(与闸门底行顺序一致)
const DOCS = [
  { key: 'tos', text: 'tos', agree: 'agreeTos', file: 'agreement.html' },
  { key: 'privacy', text: 'privacy', agree: 'agreePrivacy', file: 'privacy.html' },
  { key: 'community', text: 'community', agree: 'agreeCommunity', file: 'community.html' },
];

// 签收键 → sessionStorage 键名(与 consent-session.js / guide-card.js / settings.js 同一契约)
const CONSENT_KEYS = {
  tos: 'agreementConsented',
  privacy: 'privacyConsented',
  community: 'communityConsented',
};

/**
 * 铺开三协议面板。
 * @param {object} opts
 * @param {string|number} [opts.z]  面板 z-index(默认接在闸门之上)
 * @param {function} [opts.onDone]  三份都勾完时的回调(闸门据此点亮 ENTER)
 * @param {function} [opts.onClose] 用户中途关面板时的回调(闸门恢复显示)
 * @returns {{ open:Function, close:Function, isDone:Function, destroy:Function }}
 */
export function setupAgreementSwipe(opts) {
  opts = opts || {};
  const ZINDEX = opts.z || 2147483000;
  const P = GLOBAL.pact;

  let root = null;
  let iframe = null;
  let cur = 0;
  let closed = false;
  let lastFocused = null;
  const checked = { tos: false, privacy: false, community: false };

  function build() {
    root = document.createElement('div');
    root.id = 'b612Pact';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'B612 agreements');
    root.innerHTML = `
      <div class="pFrame">
        <div class="pBar">
          <div class="pTabs" role="tablist">
            ${DOCS.map(
              (d, i) =>
                `<button class="pTab" type="button" role="tab" data-i="${i}">${tt(P[d.text])}<span class="pDot" aria-hidden="true"></span></button>`
            ).join('')}
          </div>
          <button class="pClose" type="button"></button>
        </div>
        <div class="pStage"><iframe class="pDoc" title="agreement" referrerpolicy="no-referrer"></iframe></div>
        <div class="pFoot">
          <label class="pAgree">
            <input type="checkbox" id="pChk">
            <span id="pAgreeText"></span>
          </label>
          <span class="pProgress" id="pProg"></span>
          <button class="pNext" id="pNext" type="button" disabled></button>
        </div>
      </div>
      <style>
      #b612Pact{position:fixed;inset:0;z-index:${ZINDEX};display:flex;align-items:center;justify-content:center;
        background:rgba(30,22,14,.55);backdrop-filter:blur(2px);font-family:Georgia,'Times New Roman',serif}
      #b612Pact .pFrame{width:100vw;height:100vh;display:flex;flex-direction:column;
        background:#f7f2e6;border:0;border-radius:0;overflow:hidden;
        box-shadow:none}
      #b612Pact .pBar{display:flex;align-items:center;gap:10px;padding:10px 14px;flex:none;
        border-bottom:1px solid rgba(90,72,50,.22);background:rgba(240,232,214,.96)}
      #b612Pact .pTabs{display:flex;gap:6px;flex:1;flex-wrap:wrap}
      #b612Pact .pTab{font-family:inherit;font-size:13.5px;letter-spacing:.06em;color:#6a5a44;cursor:pointer;
        padding:7px 14px;border:1px solid rgba(90,72,50,.28);border-radius:999px;background:transparent;
        display:inline-flex;align-items:center;gap:7px;transition:all .18s ease}
      #b612Pact .pTab:hover{color:#3f3529;border-color:rgba(90,72,50,.55)}
      #b612Pact .pTab.on{background:#3f3529;color:#f7f2e6;border-color:#3f3529}
      #b612Pact .pTab .pDot{width:6px;height:6px;border-radius:50%;background:#b9a68b;display:inline-block;flex:none}
      #b612Pact .pTab.signed .pDot{background:#4e9a5f}
      #b612Pact .pClose{font-family:inherit;font-size:13px;color:#7a5c3e;cursor:pointer;background:none;
        border:none;padding:6px 8px;letter-spacing:.06em;flex:none}
      #b612Pact .pClose:hover{color:#4e4237}
      #b612Pact .pStage{flex:1;min-height:0;position:relative;background:#fff}
      #b612Pact .pDoc{position:absolute;inset:0;width:100%;height:100%;border:0}
      #b612Pact .pFoot{flex:none;display:flex;align-items:center;gap:14px;padding:11px 16px;
        border-top:1px solid rgba(90,72,50,.22);background:rgba(240,232,214,.96);flex-wrap:wrap}
      #b612Pact .pAgree{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none;
        color:#54463a;font-size:14px;letter-spacing:.04em}
      #b612Pact .pAgree input{accent-color:#a04a35;width:16px;height:16px;cursor:pointer;flex:none}
      #b612Pact .pProgress{margin-left:auto;font-size:12.5px;color:#8a7a62;letter-spacing:.1em}
      #b612Pact .pNext{font-family:inherit;font-size:13.5px;letter-spacing:.14em;cursor:pointer;
        padding:9px 22px;border-radius:999px;border:1px solid #a04a35;background:#a04a35;color:#fff;
        transition:all .18s ease}
      #b612Pact .pNext:disabled{background:transparent;color:#b3a48c;border-color:rgba(90,72,50,.25);cursor:default}
      @media (max-width:640px){
        #b612Pact .pFrame{width:100vw;height:100vh;border-radius:0}
        #b612Pact .pFoot{padding:9px 12px;gap:9px}
        #b612Pact .pProgress{margin-left:0;order:3;width:100%;text-align:center}
        #b612Pact .pNext{margin-left:auto}
        #b612Pact .pTab{font-size:12px;padding:6px 10px}
      }
      </style>`;
    document.body.appendChild(root);

    iframe = root.querySelector('.pDoc');
    const closeBtn = root.querySelector('.pClose');
    closeBtn.textContent = tt(P.back);
    closeBtn.onclick = function () {
      close();
    };

    root.querySelectorAll('.pTab').forEach(function (t) {
      t.onclick = function () {
        show(Number(t.getAttribute('data-i')));
      };
    });

    const chk = root.querySelector('#pChk');
    chk.addEventListener('change', function () {
      const k = DOCS[cur].key;
      checked[k] = chk.checked;
      // 勾选即写键:与旧流程"每份各勾一次"语义一致(收尾时还会统一补写一次防缺口)
      if (chk.checked) sessionStorage.setItem(CONSENT_KEYS[k], '1');
      else sessionStorage.removeItem(CONSENT_KEYS[k]);
      sync();
    });

    root.querySelector('#pNext').onclick = function () {
      if (!checked[DOCS[cur].key]) return;
      if (cur < DOCS.length - 1) {
        show(cur + 1);
      } else {
        // 三份都勾完 → 写齐三键,通知闸门点亮 ENTER,关面板
        Object.keys(CONSENT_KEYS).forEach(function (k) {
          sessionStorage.setItem(CONSENT_KEYS[k], '1');
        });
        close(true);
      }
    };
  }

  function sync() {
    const d = DOCS[cur];
    root.querySelector('#pAgreeText').textContent = tt(P[d.agree]);
    const nextBtn = root.querySelector('#pNext');
    nextBtn.disabled = !checked[d.key];
    nextBtn.textContent = cur === DOCS.length - 1 ? tt(P.finish) : tt(P.next);
    const signedN = DOCS.filter(function (x) {
      return checked[x.key];
    }).length;
    root.querySelector('#pProg').textContent = tt(P.progress).replace('{n}', String(signedN));
    root.querySelectorAll('.pTab').forEach(function (t, i) {
      t.classList.toggle('on', i === cur);
      t.classList.toggle('signed', !!checked[DOCS[i].key]);
    });
  }

  function show(i) {
    cur = i;
    // ?embed=1:文档内自带的 consentBar / 「‹ 返回」自动隐藏(三份 html 均有 embed 分支)。
    // 换文档时勾选状态从 checked 表恢复 —— 三份各自独立签署。
    iframe.src = DOCS[i].file + '?embed=1';
    const chk = root.querySelector('#pChk');
    chk.checked = !!checked[DOCS[i].key];
    sync();
  }

  function open() {
    if (!root) build();
    closed = false;
    lastFocused = document.activeElement;
    root.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    show(cur); // 再次打开时回到上次读的那份,勾选状态保留
  }

  function close(doneFlag) {
    if (closed) return;
    if (!root) return;
    root.style.display = 'none';
    document.body.style.overflow = '';
    iframe.src = 'about:blank'; // 停掉文档里的轮询/动画,不触发任何 reload
    closed = true;
    if (lastFocused && lastFocused.focus) {
      try {
        lastFocused.focus();
      } catch (e) {}
    }
    if (doneFlag === true && opts.onDone) opts.onDone();
    else if (opts.onClose) opts.onClose();
  }

  // Esc = 返回闸门(与面板内「‹ 返回闸门」等效;签收状态留在 checked 表里,重开即恢复)
  function onKey(e) {
    if (e.key === 'Escape' && root && root.style.display !== 'none') {
      e.stopPropagation();
      close(false);
    }
  }
  document.addEventListener('keydown', onKey);

  return {
    open: open,
    close: close,
    isDone: function () {
      return DOCS.every(function (d) {
        return !!checked[d.key];
      });
    },
    destroy: function () {
      document.removeEventListener('keydown', onKey);
      if (root) root.remove();
      root = null;
    },
  };
}

/**
 * 供闸门调用:把底行的三个链接接管成"铺开三协议面板"的入口。
 * 非闸门场景(如直开 agreement.html?from=gate)不受影响。
 */
export function spawnAgreementPages(ov, hints) {
  hints = hints || {};
  const swipe = setupAgreementSwipe({
    z: hints.z,
    onDone: function () {
      if (hints.onRestore) hints.onRestore();
      if (hints.onAllSigned) hints.onAllSigned();
    },
    onClose: function () {
      if (hints.onRestore) hints.onRestore();
    },
  });
  ov.querySelectorAll('.gLegal a[data-doc]').forEach(function (a) {
    a.onclick = function (e) {
      e.preventDefault();
      if (hints.onHide) hints.onHide();
      swipe.open();
    };
  });
  return swipe;
}
