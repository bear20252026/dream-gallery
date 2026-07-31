// 液态玻璃叠加层 · 透明 overlay 宿主（vanilla）
// 把 martin65536/liquid-glass-webgl 的 WebGL 折射渲染器作为「透明覆盖层」接进昆仑:
//   - 上层透明 canvas(z5) 在 Three 画布(z1) 之上、游戏 HUD(z10+) 之下
//   - 每帧把 Three 画布 texImage2D 喂给渲染器 wallpaper,玻璃面板用 sampleWallpaper 折射实时 3D 场景
//   - 扫描带 .lg-glass 的 DOM 面板,按其 getBoundingClientRect 绘制 glass-shape;DOM 文字控件仍在玻璃之上
// 仅桌面端 + 非低画质启用(移动端跳过 → 测试门禁不受影响)。Apache-2.0 署名见 ./NOTICE。
import { LiquidGlassRenderer } from './renderer/index.js'

let renderer = null
let rafId = null
let canvas = null
let threeCanvas = null
let enabled = false
let lastSig = ''
let onResize = null

// 构建一个 glass-shape 元素配置(折射 3D 场景、G2 圆角、色差、高光、外阴影)
function makeGlassPanel (rect, id) {
  const radius = Math.min(rect.h / 2, rect.w / 2, 20)
  return {
    id: id || ('lg' + Math.random().toString(36).slice(2, 8)),
    kind: 'glass-shape',
    rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    cornerRadius: radius,
    refractionHeight: 26,
    refractionAmount: -26, // 已取负,匹配 Kotlin 的 -refractionAmount
    depthEffect: true,
    chromaticAberration: true,
    blurRadius: 10,
    saturation: 1.12,
    brightness: 1.06,
    contrast: 1.02,
    tintColor: [1, 1, 1, 0.06],
    surfaceColor: [1, 1, 1, 0.05],
    highlight: { mode: 0, color: [1, 1, 1], angle: -Math.PI / 4, falloff: 1, alpha: 0.45, widthDp: 1.4 },
    outerShadow: { radius: 26, alpha: 0.32, offsetX: 0, offsetY: 8, color: [0, 0, 0] },
    innerShadow: null,
    label: '',
    labelColor: [1, 1, 1, 1],
    showChevron: false,
    isInteractive: false,
    sampleWallpaper: true // 折射来源 = wallpaper(Three 画布),而非透明 scene FBO
  }
}

// 扫描 .lg-glass 面板,返回可视面板的 glass-shape 配置数组
function gatherPanels () {
  const els = document.querySelectorAll('.lg-glass')
  const out = []
  els.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return
    const id = el.id || ('lg-' + out.length)
    out.push(makeGlassPanel({ x: r.left, y: r.top, w: r.width, h: r.height }, id))
  })
  return out
}

function frame () {
  if (!renderer || !enabled) return
  try {
    if (threeCanvas) renderer.updateBackdrop()
    const els = gatherPanels()
    // 用签名避免无变化时仍 setElements(虽 diff 安全,省一次调用更稳)
    const sig = els.map(e => e.id + ':' + Math.round(e.rect.x) + ',' + Math.round(e.rect.y) + ',' + Math.round(e.rect.w) + 'x' + Math.round(e.rect.h)).join('|')
    if (sig !== lastSig) {
      renderer.setElements(els)
      lastSig = sig
    }
    renderer.needsRedraw = true // 背景每帧在变(3D 场景),强制重绘
    renderer.render()
  } catch (e) {
    // 单帧异常不应炸掉整条管线
    console.warn('[liquidglass] frame skip:', e && e.message)
  }
  rafId = requestAnimationFrame(frame)
}

export function initLiquidGlass (ctx) {
  if (enabled) return true
  // 门禁:仅桌面端、非低画质;移动端(<768)跳过 → test-mobile 门禁不受影响
  const lowQ = ctx && ctx.store ? !!ctx.store.json('lowQuality', false) : false
  if (window.innerWidth < 768 || lowQ) return false
  threeCanvas = document.querySelector('#c canvas') || document.querySelector('canvas')
  if (!threeCanvas || !threeCanvas.getContext) return false
  canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:5;pointer-events:none;'
  document.body.appendChild(canvas)
  try {
    renderer = new LiquidGlassRenderer(canvas, { transparent: true })
  } catch (e) {
    console.warn('[liquidglass] renderer init failed, disabling:', e && e.message)
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    canvas = null
    renderer = null
    return false
  }
  renderer.resize(window.innerWidth, window.innerHeight)
  renderer.setBackdropCanvas(threeCanvas)
  document.body.classList.add('lg-on')
  enabled = true
  onResize = () => { if (renderer) renderer.resize(window.innerWidth, window.innerHeight) }
  window.addEventListener('resize', onResize)
  rafId = requestAnimationFrame(frame)
  return true
}

export function teardownLiquidGlass () {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  if (onResize) window.removeEventListener('resize', onResize)
  onResize = null
  if (renderer && renderer.dispose) { try { renderer.dispose() } catch (e) {} }
  renderer = null
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
  canvas = null
  document.body.classList.remove('lg-on')
  enabled = false
  lastSig = ''
}
