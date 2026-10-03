// consent-session.js — 三连协议会话签名(2026-09-18 自 main.js 外迁;结构审计 P3a)
// 闸门 60s 超时/初始化失败时放行用。会话级键不进 store(存档规矩:sessionStorage 不登记)。
// 刻意零依赖:引导阶段即可静态 import。
//
// 2026-10-03(主人批准「把协议勾选从开头拿掉」):玩游戏不再需要先勾选协议。
// 只有真正把内容交给服务器的动作(上传照片/链接、在回声壁发言)才在那一刻请求同意 ——
// 见 askConsent()。阅读协议仍可从闸门底部的三个链接进入。
export function signAllConsents() {
  sessionStorage.setItem('agreementConsented', '1');
  sessionStorage.setItem('privacyConsented', '1');
  sessionStorage.setItem('communityConsented', '1');
}

/** 本会话是否已同意三份协议 */
export function hasConsent() {
  try {
    return (
      !!sessionStorage.getItem('agreementConsented') &&
      !!sessionStorage.getItem('privacyConsented') &&
      !!sessionStorage.getItem('communityConsented')
    );
  } catch (e) {
    return false;
  }
}

/**
 * 需要时才问:上传/发言前弹一张小卡片。同意 → 写会话标记并继续 onYes;取消 → 什么也不做。
 * 已同意过则直接继续。
 */
export function askConsent(onYes) {
  if (hasConsent()) {
    onYes && onYes();
    return;
  }
  if (document.getElementById('consentAsk')) return;
  const zh = (document.body.getAttribute('data-script-lang') || '') === 'zh';
  const ov = document.createElement('div');
  ov.id = 'consentAsk';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(10,8,6,.55);font-family:Georgia,serif';
  const link = (href, en, cn) =>
    `<a href="${href}" target="_blank" rel="noopener" style="color:#7a5c3e">${zh ? cn : en}</a>`;
  ov.innerHTML =
    '<div style="width:min(420px,90vw);background:#f6eedb;color:#3f3529;border-radius:10px;padding:22px 22px 16px;box-shadow:0 20px 60px rgba(0,0,0,.45);line-height:1.7">' +
    `<div style="font-size:16px;margin-bottom:8px">${zh ? '分享之前' : 'Before you share'}</div>` +
    `<div style="font-size:14px">${
      zh
        ? '上传或发言会把内容交给服务器。请先阅读并同意'
        : 'Uploading or posting sends your content to our server. Please read and agree to the'
    } ${link('agreement.html', 'Terms of Service', '服务条款')} · ${link('privacy.html', 'Privacy Policy', '隐私政策')} · ${link('community.html', 'Community Guidelines', '社区准则')}.</div>` +
    '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">' +
    `<button type="button" data-c="no" style="font:inherit;padding:9px 16px;border-radius:18px;border:1px solid #b9a27c;background:none;color:#5c4a36;cursor:pointer;min-height:44px">${zh ? '取消' : 'Cancel'}</button>` +
    `<button type="button" data-c="yes" style="font:inherit;padding:9px 18px;border-radius:18px;border:none;background:#7a5a36;color:#fff3da;cursor:pointer;min-height:44px">${zh ? '同意并继续' : 'Agree and continue'}</button>` +
    '</div></div>';
  document.body.appendChild(ov);
  ov.querySelector('[data-c="no"]').onclick = () => ov.remove();
  ov.querySelector('[data-c="yes"]').onclick = () => {
    signAllConsents();
    ov.remove();
    onYes && onYes();
  };
}
