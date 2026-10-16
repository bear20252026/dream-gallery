// shared/err-text.mjs — 把"任何可能被当错误交出来的东西"折成一句文本(2026-10-16 checkJs 第九刀)
//
// 为什么要有它,而不是在十四个调用点各写一遍 `e && e.message`:
// `Loader.load(url, onLoad, onProgress, onError)` 的 `onError` 形参,在 @types/three 里写着
// `(err: unknown) => void`(见 node_modules/@types/three/src/loaders/Loader.d.ts:39)——
// **three 自己就说这个值的类型它不知道**。而全仓十四个加载失败分支直接读 `e.message`,那是替 three
// 做了一个它没批准的断言:同一条失败链上可能交来 ProgressEvent(`type:'error'`,没有 message)、
// 也可能交来一个字符串或 undefined(实测这一族真实 14 处,其中 5 处所在文件根本不在 checkJs 程序集里)。
// 所以这里把三件事一次说清:①有 message 且是字符串 → 用它;②是事件形状(有 string 的 type)→ 用 type;
// ③其余 → `String(e)`。返回值恒为 string,调用点再也不会因为"错误本身没有 message"而二次抛错。
//
// ⚠️边界:本模块**不判断"这是不是错误"**,只负责把已经判定为失败的东西说成人话。
// 不要拿它去替代 `if (err)` 这类控制流判断。

/**
 * @param {unknown} e loader/其它回调交出来的失败值(类型由对方声明,这里一律当未知)
 * @returns {string} 永不为 null、永不为对象本身;最差是空串(如 `String('')`)
 */
export function errText(e) {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const o = /** @type {{ message?: unknown, type?: unknown }} */ (e);
    // 取值优先级:**字符串 message → 字符串 type → 其它形状的 message → String(e)**。
    // 为什么把"字符串 type"排在"非字符串 message"前面:像 `{ message: {…}, type: 'abort' }` 这种,
    // 打 `[object Object]` 远不如打 `abort` 有用;而真正的 Error 一定命中第一条,不受影响。
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.type === 'string' && o.type) return o.type;
    if (o.message != null && o.message !== '') return String(o.message);
    // 兜底走 `Object.prototype.toString.call` 而不是 `String(e)`:后者对**无原型对象**
    // (`Object.create(null)`)会抛 `TypeError: Cannot convert object to primitive value`,
    // 而本函数的契约是"绝不变成第二条异常"——调用点是 console.warn 的参数,抛出去就把一次
    // 加载失败变成一次未捕获异常。这条不是我猜的,是表驱动用例第一次跑就抓到的。
    return Object.prototype.toString.call(e);
  }
  return String(e);
}
