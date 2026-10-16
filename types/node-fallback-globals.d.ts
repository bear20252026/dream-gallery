// Node 侧全局 `Buffer` 的**最小**声明(第十刀·批次1)。
//
// 消费者只有一处、两个调用面:`src/shared/chapter-map-logic.mjs` 的
//   `Buffer.from(s, 'utf8').toString('base64')` 与 `Buffer.from(s, 'base64').toString('utf8')`,
// 它们是 `typeof btoa === 'function'` 不成立时的**兜底分支**(非浏览器运行时才走)。
//
// 为什么不直接 `npm i -D @types/node` + 往 tsconfig.checkjs.json 的 types 里加 "node":
// @types/node 其实**已经在** node_modules 里(被 ndarray/glob 带进来的),那条路一行的确能抹掉这两条
// TS2591 —— 但等于给整个**浏览器**程序放开 process / require / __dirname / global 全套全局,
// 以后产品代码误用 node API 会一路绿到运行时才炸。缺哪块补哪块,不借一整副牌照。
// 这条判据本身也有钉子:同一份测试文件断言 types 数组里始终**没有** "node"。
//
// 门禁:`npx tsc -p tsconfig.checkjs.json`(判据见 src/__tests__/plane-and-save-shapes.test.js)。

/** `Buffer.from(...)` 的返回:兜底分支只用到 `toString`。 */
interface NodeFallbackBuffer {
  toString(encoding?: string): string;
}

/** 只声明用到的 `from(字符串, 编码)`,不冒充完整 BufferConstructor。 */
interface NodeFallbackBufferConstructor {
  from(data: string, encoding?: string): NodeFallbackBuffer;
}

declare var Buffer: NodeFallbackBufferConstructor;
