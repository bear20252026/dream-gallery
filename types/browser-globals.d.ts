// 浏览器 API 的**非标准成员**声明。TS 的 lib.dom 只收录标准已定稿的属性,
// 而这些属性是"Chrome 有、别的浏览器没有"的现实 —— 代码里已经按可缺读取
// (`navigator.deviceMemory || 0`),缺的正是这份声明而不是那道守卫。
// 门禁:`npx tsc -p tsconfig.checkjs.json` 报出缺声明,判据在 src/__tests__/ctx-writer-shapes.test.js 批次6-5。

interface Navigator {
  /**
   * Device Memory API(https://developer.mozilla.org/docs/Web/API/Navigator/deviceMemory):
   * **不是 Baseline**(MDN 原话"does not work in some of the most widely-used browsers"),
   * 且只在安全上下文(HTTPS)下给值。2026-10-16 核实 `node_modules/@typescript/typescript-win32-x64/lib/lib.dom.d.ts`
   * 里没有这一项(同一段的 `hardwareConcurrency` 有,在 :25928)—— 所以缺的是这份声明,不是代码。
   * 返回 GiB 单位的近似浮点数,为防指纹**取整到 2 的幂**并夹在浏览器自定义的上下界内
   * (MDN 举例:下限 2、上限 32 的浏览器只可能给 2/4/8/16/32)。
   * 写成可选数(`?: number`)照的正是这两条:不支持的浏览器读到 `undefined`,
   * 而消费点本来就写 `|| 0`。
   * 消费者两处指纹缓存:`src/gallery/mode.js:123` 与 `src/visitor-fp.js:52`,都写成 `|| 0`。
   */
  readonly deviceMemory?: number;
}
