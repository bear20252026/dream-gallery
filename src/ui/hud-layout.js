// ui/hud-layout.js — 屏幕布局统一收口(2026-10-03 测试反馈:手机上顶部、底部按钮互相压住、太挤)
// 原来每个模块各自写死 position/top/right,彼此不知道对方,小屏就叠在一起。
// 这里用一张样式表统一排位(!important 覆盖各模块内联值),规则:
//   顶部:左 = 任务卡;右 = 菜单钮,下面是小地图,再下面是时刻/地名(电脑);
//         「?」与语言钮在电脑上排在菜单钮左边,手机上收进菜单。
//   底部(手机):左 = 摇杆;右 = 跳跃,其上依次「视角」「⌂」;中间留给当下唯一的大按钮(进入 B612 等),
//         抬高到摇杆/跳跃上方,不再压住它们。
//   对白进行时(手机):摇杆/跳跃/视角/⌂/音乐/大按钮/罗盘/操作小课全部让位,只留对话框。
//   纯装饰(B612 标题、底部氛围小字、时刻/地名、AI 配文框)在手机上不显示。
const CSS = `
/* —— 所有尺寸 —— */
#m{top:70px!important;right:12px!important}
#desertTimeHud{position:fixed!important;left:auto!important;right:14px!important;top:232px!important;align-items:flex-end}
#desertTerrainHud{top:272px!important;right:14px!important}
/* AI 配文框没有内容时不占地方(原来空框也挂着「B612 · memory echo / * * *」) */
#aiPanel:has(#aiT:empty){display:none!important}

/* —— 手机(≤600px) —— */
@media (max-width:600px){
  #t,#skyNote,#aiPanel,#desertTimeHud,#desertTerrainHud,#ctlHelpBtn,#hudLang,#ab{display:none!important}
  #m{top:66px!important;right:10px!important}
  #gsMenuBtn{top:10px!important;right:10px!important;height:44px!important;padding:0 13px 0 11px!important}
  #questHud.folded{top:10px!important;left:10px!important;width:calc(100vw - 140px)!important}
  #j{left:14px!important;bottom:18px!important}
  #jumpBtnGlide{width:84px!important;height:84px!important;right:14px!important;bottom:22px!important;font-size:28px!important}
  #descendBtnSpace{width:84px!important;height:84px!important;right:108px!important;bottom:22px!important;font-size:28px!important}
  #viewBtn{right:20px!important;bottom:118px!important}
  #homeBtn{right:26px!important;bottom:160px!important;width:44px!important;height:44px!important;border-radius:22px!important}
  #gateBtn{bottom:150px!important;padding:11px 24px!important;font-size:16px!important;letter-spacing:2px!important;white-space:nowrap!important}
  #worldNav{bottom:160px!important;gap:8px!important}
  #worldNav button{padding:10px 18px!important;letter-spacing:1px!important;font-size:15px!important;white-space:nowrap!important;max-width:calc(100vw - 40px)!important;overflow:hidden;text-overflow:ellipsis}
  #sheepCompanion{top:146px!important}
  #sheepCompanion small{display:none!important}
  #ctlLesson{top:auto!important;bottom:236px!important}
  #storyCompass{max-width:calc(100vw - 150px)!important;left:10px!important}
  body[data-dialog-open] #j,
  body[data-dialog-open] #jumpBtnGlide,
  body[data-dialog-open] #descendBtnSpace,
  body[data-dialog-open] #viewBtn,
  body[data-dialog-open] #homeBtn,
  body[data-dialog-open] #gateBtn,
  body[data-dialog-open] #storyCompass,
  body[data-dialog-open] #ctlLesson{visibility:hidden!important;pointer-events:none!important}
  .gs-menu-card .m-btn{margin:7px 0!important;padding:9px 0!important;font-size:15px!important}
}
/* While a witness card (325/326/327) is open, the movement controls, compass and lesson card step aside, at every size. */
body[data-witness] #j,
body[data-witness] #jumpBtnGlide,
body[data-witness] #descendBtnSpace,
body[data-witness] #viewBtn,
body[data-witness] #homeBtn,
body[data-witness] #gateBtn,
body[data-witness] #worldNav,
body[data-witness] #storyCompass,
body[data-witness] #ctlLesson{visibility:hidden!important;pointer-events:none!important}
/* 菜单里「操作说明 / 语言 / 音乐」三项只在手机上出现(电脑上这三个钮本来就在屏幕上) */
@media (min-width:601px){ .gs-menu-card .m-phone{display:none!important} }
`;

export function mountHudLayout() {
  if (typeof document === 'undefined' || document.getElementById('hudLayoutCss')) return;
  const st = document.createElement('style');
  st.id = 'hudLayoutCss';
  st.textContent = CSS;
  document.head.appendChild(st);
}
