// shared/dom-typed.js — DOM 查询结果的**类型化取用**单一出处(2026-10-16 checkJs 第七刀)
//
// 为什么要这么一层:`document.getElementById` 的返回类型是 `HTMLElement`,而 `Element.querySelector`
// 的返回类型是 `Element` —— 这两个类型上**没有** `.value` / `.dataset` / `.style` / `.onclick` /
// `.getContext`,于是"取一个输入框读它的值"这种完全正确的代码会被编译器逐点判成 TS2339。
// 上一批(第四刀)在 `upload.js` 里的做法是"在取用点旁声明一次带类型的引用",这条被验证过有效,
// 但它在每个文件各写一遍;这一层把那句 cast 收到**一个地方**,按标签命名,谁错了一眼看得出来。
//
// ⚠️三条边界,改这个文件前先读:
// 1. **运行期行为与裸 `querySelector` / `getElementById` 逐字相同**:不校验标签、不抛错、不改返回值,
//    只有静态类型不同。所以这里**不许**加 `instanceof` 之类的"顺手加固" —— 那会把今天能工作的
//    `<a>` 当 `<button>` 用时突然变成 null,是一次真实的行为变更,不属于类型批次。
// 2. 声称的标签写错不会报错,只会让类型说谎 ⇒ 每条调用点的"选择器 ↔ 标签"由
//    `src/__tests__/dom-typed-sites.test.js` 拿源码里的 markup 反向核对,不靠人眼。
// 3. 只收**取用**这一件事。需要 `NodeListOf` 原样(要传给别的 API)时仍然写
//    `/** @type {NodeListOf<…>} */ (…)`,别为了用这里的函数把 NodeList 换成数组。

/**
 * 按 id 取元素,当普通 HTMLElement 用(style / dataset / textContent / onclick)。
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function byIdEl(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

/**
 * 按 id 取表单输入框(`<input>`)。
 * @param {string} id
 * @returns {HTMLInputElement|null}
 */
export function byIdInput(id) {
  return /** @type {HTMLInputElement|null} */ (document.getElementById(id));
}

/**
 * 按 id 取画布(`<canvas>`)。
 * @param {string} id
 * @returns {HTMLCanvasElement|null}
 */
export function byIdCanvas(id) {
  return /** @type {HTMLCanvasElement|null} */ (document.getElementById(id));
}

/**
 * 按 id 取下拉框(`<select>`)。第八刀需要:spirit-page 的 #spPrefix。
 * @param {string} id
 * @returns {HTMLSelectElement|null}
 */
export function byIdSelect(id) {
  return /** @type {HTMLSelectElement|null} */ (document.getElementById(id));
}

/**
 * 按 id 取按钮(`<button>`)。`disabled` 只在按钮/表单元素上,普通 HTMLElement 没有。
 * @param {string} id
 * @returns {HTMLButtonElement|null}
 */
export function byIdBtn(id) {
  return /** @type {HTMLButtonElement|null} */ (document.getElementById(id));
}

/**
 * 在 root 范围内取一个普通元素。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement|null}
 */
export function qsEl(root, sel) {
  return /** @type {HTMLElement|null} */ (root.querySelector(sel));
}

/**
 * 在 root 范围内取一个 `<button>`。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLButtonElement|null}
 */
export function qsBtn(root, sel) {
  return /** @type {HTMLButtonElement|null} */ (root.querySelector(sel));
}

/**
 * 在 root 范围内取一个 `<input>`。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLInputElement|null}
 */
export function qsInput(root, sel) {
  return /** @type {HTMLInputElement|null} */ (root.querySelector(sel));
}

/**
 * 在 root 范围内取一个 `<textarea>`。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLTextAreaElement|null}
 */
export function qsArea(root, sel) {
  return /** @type {HTMLTextAreaElement|null} */ (root.querySelector(sel));
}

/**
 * 在 root 范围内取一个 `<select>`。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLSelectElement|null}
 */
export function qsSelect(root, sel) {
  return /** @type {HTMLSelectElement|null} */ (root.querySelector(sel));
}

/**
 * 在 root 范围内取一组普通元素(返回**数组**,不是 NodeList)。
 * 用在 `.forEach(el => el.dataset.x)` 这类只遍历一次的场合;要 NodeList 本体请看文件头边界 3。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export function qsaEl(root, sel) {
  return Array.from(/** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(sel)));
}

/**
 * 在 root 范围内取一组 `<button>`(返回**数组**)。
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLButtonElement[]}
 */
export function qsaBtn(root, sel) {
  return Array.from(/** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll(sel)));
}
