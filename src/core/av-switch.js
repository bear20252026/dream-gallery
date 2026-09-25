// av-switch.js — 全站音视频总闸(2026-09-26 主人令:先把线上所有播放的音频视频停掉,很干扰)
// 语义:默认全静(fail-closed);恢复方式三选一:
//   ① 访问时 URL 带 ?av=1(同时写入 localStorage,后续页面免带参数)
//   ② 控制台 localStorage.setItem('avOn','1') 后刷新
//   ③ URL 带 ?av=0 显式关闭并清除记忆
// 各播放点(音频/视频)统一 import 本模块前置判断;骨骼动画(AnimationMixer)不属音视频,不接闸。
//
// 豁免范围(2026-09-26 主人追加令:「先只让人物的对话进行」):
//   avAllowed('dialogue') 恒真 —— 人物对白(kunlunSpeak TTS / 剧情台词朗读 dialog-voice)
//   不受总闸影响,照常开口;其余(BGM/视频/提示音/协议配乐/彩蛋)仍默认全静。
const LS_KEY = 'avOn';
function avAllowed(scope) {
  if (scope === 'dialogue') return true; // 对白豁免:人物说话不算干扰源
  try {
    const q = new URLSearchParams(location.search).get('av');
    if (q === '1') {
      localStorage.setItem(LS_KEY, '1');
      return true;
    }
    if (q === '0') {
      localStorage.removeItem(LS_KEY);
      return false;
    }
    return localStorage.getItem(LS_KEY) === '1';
  } catch (e) {
    return false; // localStorage 不可用(隐私模式等):保持全静
  }
}
export { avAllowed };
