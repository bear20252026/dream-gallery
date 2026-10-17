// visit-timers.mjs — “每一次进入某个世界”是一条独立的计时器世代(2026-10-17 外部审计 C4)
//
// 为什么要单独一个模块,而不是在场景文件里加个 if:
// late-planets 那三颗星的小玩法(328 数星星 / 329 点灯 / 330 讲 B612)全部用裸 `setTimeout` 收尾,
// 而它们的“完成回调”做三件不可逆的事:`closePanel()` 拆面板、`done()` 推进 chainB、
// `head.userData.manual = false` 交还路灯。**在场判定(`activeWorld !== world → return`)挡不住同世界快返**
// —— 离开再走回来,那句话仍然成立,于是上一世的尾巴会拆掉这一世的面板、把剧情推两遍。
// 329 更硬:那个 `setInterval` 用**模块级全局** `gameEl` 判活,重进后 `gameEl` 被新面板重新赋值 ⇒
// 旧 interval 永远停不下来,和新那个一起 `paint()`、一起 `setLampLit()` 抢同一盏路灯头。
//
// 所以“我还活着吗”必须由**世代号**回答,而不是由“在不在这个世界”回答。
// 三条契约(单测逐条钉):
//   ① bump 之后,上一世登记的 later/every 一律不再执行(interval 还被真停止,不是“执行了但没作用”);
//   ② `later` 的回调只在“同一世代 ∧ 当时在场”时执行 —— 离场未 bump 的那些一刻也不该偷偷跑;
//   ③ teardown 每次 bump 至多跑一次(交还路灯 `manual` 这类动作,跑两次就会覆盖新一世刚设的状态)。
// 本模块零依赖、不碰 DOM、不 import ctx:世界在不在场由调用方以 `isHere()` 注入(保持可单测)。

/**
 * @param {(world:string)=>boolean} [isHere] 该世界此刻是否在场(默认视为在场)
 */
export function createVisitClock(isHere) {
  const here = typeof isHere === 'function' ? isHere : () => true;
  /** @type {Map<string,{gen:number,timers:Set<any>,teardown:null|(()=>void)}>} */
  const states = new Map();
  function st(world) {
    let s = states.get(world);
    if (!s) {
      s = { gen: 0, timers: new Set(), teardown: null };
      states.set(world, s);
    }
    return s;
  }

  /** 结束当前世代并进入新的一世:掐掉所有在飞的计时器,跑一次 teardown。返回新世代号。 */
  function bump(world) {
    const s = st(world);
    s.gen++;
    for (const h of s.timers) {
      clearTimeout(h);
      clearInterval(h);
    }
    s.timers.clear();
    if (s.teardown) {
      const fn = s.teardown;
      s.teardown = null;
      try {
        fn();
      } catch (e) {
        console.warn('[visit-timers] teardown 抛错(不拦世代推进)', e);
      }
    }
    return s.gen;
  }

  /** 本世代是否仍然有效(未换世)**且**在该世界内 */
  function alive(world, gen) {
    return st(world).gen === gen && here(world);
  }

  /** 本世代的一次性延时:换世或不在场都不执行。 */
  function later(world, gen, fn, ms) {
    const s = st(world);
    const h = setTimeout(() => {
      s.timers.delete(h);
      if (s.gen !== gen || !here(world)) return;
      fn();
    }, ms);
    s.timers.add(h);
    return h;
  }

  /** 本世代的循环:换世即停(clearInterval 真停,不是靠回调自己早退)。 */
  function every(world, gen, fn, ms) {
    const s = st(world);
    const h = setInterval(() => {
      if (s.gen !== gen) {
        clearInterval(h);
        s.timers.delete(h);
        return;
      }
      if (!here(world)) return; // 在场判定只管“这刻先不动”,不换世 ⇒ 下一拍继续
      fn();
    }, ms);
    s.timers.add(h);
    return h;
  }

  /** 注册本世代的收尾动作(如“把路灯的控制权交还点灯人”),bump 时跑一次。 */
  function onLeave(world, gen, fn) {
    const s = st(world);
    if (s.gen !== gen) return false; // 来世代的注册不许污染这一世
    s.teardown = fn;
    return true;
  }

  return {
    /** 当前世代号(登记回调时先取一次,之后一路带着比) */
    gen: (world) => st(world).gen,
    bump,
    alive,
    later,
    every,
    onLeave,
    /** 测试/探针用:本世代还有几个在飞计时器 */
    pending: (world) => st(world).timers.size,
  };
}
