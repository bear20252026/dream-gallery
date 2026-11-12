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
// 存档单一出口(2026-11-11 技术债收口):avOn 已登记进 store-api SCHEMA,不再直写 localStorage。
// store-api 零 ctx 依赖,core 模块直接复用(同 lobby 独立入口口径);写失败/不可用由其内部兜底。
import { storeApi } from '../state/store-api.js';
function avAllowed(scope) {
  if (scope === 'dialogue') return true; // 对白豁免:人物说话不算干扰源
  // 剧情机制音豁免(2026-10-03 结局线):找井「只能靠听」、尾声「会笑的小铃铛」是玩法本身,
  // 音量极低、只在结局线里响;?av=0 仍可显式关掉。
  // 剧情背景音乐(2026-10-03 主人提供五首、要求作为游戏配乐):默认开,玩家可用右下「音乐」钮关,
  // ?av=0 仍全部静音
  if (scope === 'music') {
    try {
      return new URLSearchParams(location.search).get('av') !== '0';
    } catch (e) {
      return true;
    }
  }
  if (scope === 'story') {
    try {
      return new URLSearchParams(location.search).get('av') !== '0';
    } catch (e) {
      return true;
    }
  }
  try {
    const q = new URLSearchParams(location.search).get('av');
    if (q === '1') return storeApi.mark('avOn'); // mark 成功=true;写失败=false(与旧 setItem 抛→catch false 同)
    if (q === '0') {
      storeApi.unmark('avOn');
      return false;
    }
    return storeApi.flag('avOn'); // 不可用时 flag=false,保持全静(fail-closed)
  } catch (e) {
    return false; // location/存储不可用(隐私模式等):保持全静
  }
}
export { avAllowed };
