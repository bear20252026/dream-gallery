// 液态玻璃叠加层 · 透明 overlay 宿主(vanilla)——忠实复刻版
// 用 martin65536/liquid-glass-webgl 的真实 catalog 工厂(makeGlassShape/makeButton/makeText/makePlainRect)
// 构建「真液态玻璃对话框」(卡片折射实时 3D 场景 + G2 圆角 + 色差 + 边缘高光 + 实心按钮),
// 文字/按钮由渲染器前景光栅化画在 canvas 上;唯一 DOM 浮层是文本输入框(浏览器限制)。
// 透明 overlay z5:Three 画布(z1)之上、游戏 HUD(z10+) 之下;移动端跳过(test-mobile 不受影响)。
import { LiquidGlassRenderer } from './renderer/index.js'
import { makeGlassShape, makeButton, makeText, makePlainRect } from './catalog/helpers.js'
import { DEFAULT_HIGHLIGHT } from './catalog/types.js'

let renderer = null
let rafId = null
let canvas = null
let threeCanvas = null
let enabled = false
let onResize = null
let currentDialog = null      // { elements, onConfirm, onClose, inputEl, pressedId }
let inputEl = null            // 复用的 DOM <input>
const LGA = { enabled: false, showDialog, closeDialog }

function buildDialog (opts) {
  const W = window.innerWidth
  const H = window.innerHeight
  const PAD = 40
  const CARD_W = Math.min(W - 2 * PAD, 360)
  const CARD_H = 300
  const CARD_X = (W - CARD_W) / 2
  const CARD_Y = (H - CARD_H) / 2
  // dialog 配色(浅色主题;按仓库 LIGHT_PALETTE)
  const contentColor = [0, 0, 0, 1]
  const accent = [0x00 / 255, 0x88 / 255, 0xff / 255, 1]
  const container = [0xfa / 255, 0xfa / 255, 0xfa / 255, 0.6]
  const dim = [0x12 / 255, 0x12 / 255, 0x12 / 255, 0.56]

  const els = []
  // 1) 全屏 dim scrim(点击即取消)
  const scrim = makePlainRect('dlg-scrim', { x: 0, y: 0, w: W, h: H }, dim, 0)
  scrim.scroll = false
  els.push(scrim)

  // 2) 玻璃卡片:refraction 24/-48(翻倍)、blur 16、saturation 1.5、brightness 0.2、
  //    surface #FAFAFA@0.6、highlight mode2/alpha0.38、depthEffect、cornerRadius 48、
  //    sampleWallpaper(折射 3D 场景)、useSeparableBlur(2-pass 高质量模糊)
  const card = makeGlassShape('dlg-card',
    { x: CARD_X, y: CARD_Y, w: CARD_W, h: CARD_H },
    {
      cornerRadius: 48,
      refractionHeight: 24,
      refractionAmount: -48,
      blurRadius: 16,
      saturation: 1.5,
      brightness: 0.2,
      surfaceColor: container,
      highlight: { ...DEFAULT_HIGHLIGHT, mode: 2, color: [1, 1, 1], alpha: 0.38, widthDp: 0.5 },
      depthEffect: true
    }, false)
  card.sampleWallpaper = true
  card.useSeparableBlur = true
  els.push(card)

  // 3) 标题(渲染器画文字)
  els.push(makeText('dlg-title',
    { x: CARD_X + 28, y: CARD_Y + 24, w: CARD_W - 56, h: 36 },
    opts.title || '标题',
    { color: contentColor, fontSizePx: 24, fontWeight: 500, align: 'left', paddingPx: 0, halo: 'none' }, false))

  // 4) 正文
  els.push(makeText('dlg-body',
    { x: CARD_X + 24, y: CARD_Y + 68, w: CARD_W - 48, h: 64 },
    opts.body || '',
    { color: [contentColor[0], contentColor[1], contentColor[2], 0.68], fontSizePx: 15, fontWeight: 400, align: 'left', wrap: true, valign: 'top', maxLines: 3, paddingPx: 0, halo: 'none' }, false))

  // 5) 两按钮:实心(dialog 按钮覆盖 refraction/blur=0、highlight/outerShadow=null)
  const BTN_H = 48
  const BTN_W = (CARD_W - 2 * 24 - 16) / 2
  const BTN_Y = CARD_Y + CARD_H - 24 - BTN_H
  const CANCEL_X = CARD_X + 24
  const OK_X = CANCEL_X + BTN_W + 16

  const cancelBtn = makeButton('dlg-cancel',
    { x: CANCEL_X, y: BTN_Y, w: BTN_W, h: BTN_H },
    { label: opts.cancelLabel || '稍后', tintColor: [0, 0, 0, 0], surfaceColor: [container[0], container[1], container[2], 0.2], labelColor: contentColor }, false)
  cancelBtn.refractionHeight = 0; cancelBtn.refractionAmount = 0; cancelBtn.blurRadius = 0
  cancelBtn.highlight = null; cancelBtn.outerShadow = null
  els.push(cancelBtn)

  const okBtn = makeButton('dlg-ok',
    { x: OK_X, y: BTN_Y, w: BTN_W, h: BTN_H },
    { label: opts.okLabel || '确定', tintColor: [0, 0, 0, 0], surfaceColor: accent, labelColor: [1, 1, 1, 1] }, false)
  okBtn.refractionHeight = 0; okBtn.refractionAmount = 0; okBtn.blurRadius = 0
  okBtn.highlight = null; okBtn.outerShadow = null
  els.push(okBtn)

  // 6) DOM 输入框(浏览器文本输入只能 DOM):透明、定位在卡片正文下方
  if (!inputEl) {
    inputEl = document.createElement('input')
    inputEl.type = 'text'
    inputEl.maxLength = 16
    inputEl.style.cssText = 'position:fixed;z-index:6;transform:translateX(-50%);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);border-radius:9px;color:#fff;font-size:15px;text-align:center;outline:none;box-sizing:border-box;padding:11px;font-family:inherit'
    document.body.appendChild(inputEl)
  }
  inputEl.placeholder = opts.inputPlaceholder || ''
  inputEl.value = opts.initialValue || ''
  const inputY = CARD_Y + 140
  inputEl.style.left = (CARD_X + CARD_W / 2) + 'px'
  inputEl.style.top = inputY + 'px'
  inputEl.style.width = (CARD_W - 48) + 'px'
  inputEl.style.display = opts.needsInput === false ? 'none' : 'block'

  return {
    elements: els,
    cardRect: { x: CARD_X, y: CARD_Y, w: CARD_W, h: CARD_H },
    okId: 'dlg-ok', cancelId: 'dlg-cancel', scrimId: 'dlg-scrim'
  }
}

export function showDialog (opts) {
  if (!enabled || !renderer) return false
  closeDialog()
  const d = buildDialog(opts || {})
  currentDialog = {
    elements: d.elements,
    onConfirm: opts.onConfirm || (() => {}),
    onClose: opts.onClose || (() => {}),
    pressedId: null,
    okId: d.okId, cancelId: d.cancelId, scrimId: d.scrimId
  }
  try { renderer.setElements(d.elements) } catch (e) { console.warn('[liquidglass] setElements', e && e.message) }
  canvas.style.pointerEvents = 'auto' // 对话框开:接收点击做命中测试
  if (inputEl) setTimeout(() => { try { inputEl.focus() } catch (e) {} }, 60)
  return true
}

export function closeDialog () {
  if (currentDialog && renderer) {
    try { renderer.setElements([]) } catch (e) {}
  }
  currentDialog = null
  if (inputEl) inputEl.style.display = 'none'
  if (canvas) canvas.style.pointerEvents = 'none'
}

// 命中测试:从顶到底(数组末尾=最上层)找第一个 rect 包含点且可交互(button)的元素
function hitTest (px, py) {
  if (!currentDialog) return null
  for (let i = currentDialog.elements.length - 1; i >= 0; i--) {
    const el = currentDialog.elements[i]
    if (el.kind !== 'button') continue
    const r = el.hitRect || el.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return el
  }
  return null
}

function onPointerDown (e) {
  if (!currentDialog || !renderer) return
  const px = e.clientX, py = e.clientY
  const hit = hitTest(px, py)
  if (hit) {
    currentDialog.pressedId = hit.id
    try { renderer.setPressed(hit.id, true, { x: px, y: py }) } catch (err) {}
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId) } catch (err) {}
  } else {
    // 点到 scrim → 取消
    finishDialog(false)
  }
}
function onPointerMove (e) {
  if (!currentDialog || !currentDialog.pressedId || !renderer) return
  try { renderer.setDragPosition(currentDialog.pressedId, { x: e.clientX, y: e.clientY }) } catch (err) {}
}
function onPointerUp (e) {
  if (!currentDialog || !renderer) return
  const px = e.clientX, py = e.clientY
  const id = currentDialog.pressedId
  if (id) {
    try { renderer.setPressed(id, false) } catch (err) {}
    // 抬起仍在该按钮上 → 触发
    const hit = hitTest(px, py)
    if (hit && hit.id === id) {
      if (id === currentDialog.okId) finishDialog(true)
      else if (id === currentDialog.cancelId) finishDialog(false)
    }
  }
  currentDialog.pressedId = null
}

function finishDialog (ok) {
  if (!currentDialog) return
  const nick = inputEl ? inputEl.value.trim() : ''
  const cb = ok ? currentDialog.onConfirm : currentDialog.onClose
  closeDialog()
  try { cb(ok ? nick : undefined) } catch (e) {}
}

function frame () {
  if (!renderer || !enabled) return
  try {
    if (threeCanvas) renderer.updateBackdrop()
    // 对话框开时用 currentDialog.elements;否则扫 .lg-glass(其它面板后续扩展)
    if (currentDialog) {
      // 已 setElements 过,这里只强制重绘(背景每帧变)
    }
    renderer.needsRedraw = true
    renderer.render()
  } catch (e) {
    console.warn('[liquidglass] frame skip:', e && e.message)
  }
  rafId = requestAnimationFrame(frame)
}

export function initLiquidGlass (ctx) {
  if (enabled) return true
  const lowQ = ctx && ctx.store ? !!ctx.store.json('lowQuality', false) : false
  if (window.innerWidth < 768 || lowQ) return false
  threeCanvas = document.querySelector('#c canvas') || document.querySelector('canvas')
  if (!threeCanvas || !threeCanvas.getContext) return false
  canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:5;pointer-events:none;touch-action:none;'
  document.body.appendChild(canvas)
  try {
    renderer = new LiquidGlassRenderer(canvas, { transparent: true })
  } catch (e) {
    console.warn('[liquidglass] renderer init failed:', e && e.message)
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    canvas = null; renderer = null; return false
  }
  renderer.resize(window.innerWidth, window.innerHeight)
  renderer.setBackdropCanvas(threeCanvas)
  enabled = true
  LGA.enabled = true
  if (ctx) ctx.liquidGlass = LGA  // 挂到 ctx 根(可扩展命名空间,非冻结)
  document.body.classList.add('lg-on')
  onResize = () => { if (renderer) renderer.resize(window.innerWidth, window.innerHeight) }
  window.addEventListener('resize', onResize)
  // 指针事件(仅在对话框开、canvas pointerEvents=auto 时生效)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  rafId = requestAnimationFrame(frame)
  return true
}

export function teardownLiquidGlass () {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  if (onResize) window.removeEventListener('resize', onResize)
  onResize = null
  closeDialog()
  if (renderer && renderer.dispose) { try { renderer.dispose() } catch (e) {} }
  renderer = null
  if (inputEl && inputEl.parentNode) inputEl.parentNode.removeChild(inputEl)
  inputEl = null
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
  canvas = null
  document.body.classList.remove('lg-on')
  enabled = false
  LGA.enabled = false
}
