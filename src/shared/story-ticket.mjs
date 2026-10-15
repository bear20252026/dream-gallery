// story-ticket.mjs — 故事链的「这一轮」票据(纯逻辑:零 ctx / 零 DOM / 零 THREE,单测钉死)
//
// 为什么要它(第六轮外部审计 M-03):一章戏是一条横跨很多拍的异步链 —— openDialog + 心跳守护 +
// 一串 setTimeout。玩家中途离开本章(走进石环、开章节地图、点旅途卡)时,对话框会被
// gameshell-dialog 的 cancelWorld 关掉,**但链子自己不知道**:心跳只看 `dialogOpen() === false`
// 就当"这句说完了",于是把下一句在新场景里弹出来,后面的回调还照旧推进存档(《小王子》里 326 的
// 拍手蒙太奇会在 B612 的夜里响起)。裸 `setTimeout` 又没人记账,离开章节时也清不掉。
//
// 票据把"这一轮还有效吗"收成一处:
//   ① 计时器只能经 later/wait 登记,bump() 一次全部作废;
//   ② 到点先问票据(还是这一轮 && 还在本场),不对就吞掉回调 —— 旧链子改不动新场景;
//   ③ `await wait(ms)` 被作废时以 false 落回(不是永远挂着),链子据此 return;
//   ④ onTeardown 登记幕布/滤镜的复位,bump 时立刻跑 —— 免得停在一个半透明的黑幕上。
//
// 用法(每个章节模块一张):
//   const story = createStoryTicket(() => ctx.scene.activeWorld === 'king326');
//   story.later(fn, 1400);            // 代替 setTimeout
//   if (!(await story.wait(3200))) return; // 代替 await wait
//   世界切换 / dispose → story.bump();
export function createStoryTicket(stillHome) {
  let visit = 0;
  const timers = new Set(); // 未到点的计时器句柄
  const waits = new Set(); // 挂起中的 wait 落回函数
  let teardowns = [];

  // 这一轮是否还有效:票据未被作废(stillHome 由调用方给,通常是"玩家还在本章")
  function home() {
    return typeof stillHome === 'function' ? !!stillHome() : true;
  }

  // 到点后把「是否仍然有效」告诉调用方(不吞落回:作废也要让 await 收得到)
  function at(ms, settle) {
    const ticket = visit;
    const handle = setTimeout(() => {
      timers.delete(handle);
      settle(ticket === visit && home());
    }, ms);
    timers.add(handle);
    return handle;
  }

  return {
    /** 还在本章吗(链子的入口守卫用这一句,别各处手写 activeWorld) */
    here() {
      return home();
    },
    /** 登记一个"只在这一轮有效"的回调;返回句柄,可 cancel */
    later(fn, ms) {
      return at(ms, (alive) => {
        if (alive) fn();
      });
    },
    /** 可等待的停顿:票据作废或玩家离场时 resolve(false) */
    wait(ms) {
      return new Promise((resolve) => {
        const settle = (alive) => {
          waits.delete(settle);
          resolve(alive);
        };
        waits.add(settle);
        at(ms, settle);
      });
    },
    cancel(handle) {
      if (handle == null) return;
      clearTimeout(handle);
      timers.delete(handle);
    },
    /** 本轮作废:清计时器、把挂起的 wait 全部判 false、跑登记的收尾 */
    bump() {
      visit++;
      for (const h of timers) clearTimeout(h);
      timers.clear();
      const pending = Array.from(waits);
      waits.clear();
      for (const settle of pending) settle(false);
      const list = teardowns;
      teardowns = [];
      for (const fn of list) fn();
      return visit;
    },
    /** 登记本轮收尾(幕布淡出、滤镜归零之类)。同一件事只登记一次:重复 bump 不重复收尾 */
    onTeardown(fn) {
      if (typeof fn !== 'function' || teardowns.includes(fn)) return false;
      teardowns.push(fn);
      return true;
    },
    /** 还剩几个未落回的计时器/await(装配自检与单测用:正常收束后应为 0) */
    leaks() {
      return timers.size + waits.size;
    },
  };
}
