// catalog/types.ts — vendored from martin65536/liquid-glass-webgl (Apache-2.0)
// 保留真实常量与调色板(照抄仓库 Kotlin 还原值),trim 掉 React/catalog 状态/控制中心等非必要部分。
import type { GlassElementConfig, GlassHighlight } from '../renderer/types'

export const DP = 1

/** Linear interpolation. Faithful to androidx.compose.ui.util.lerp. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export const BUTTON_HEIGHT = 48 * DP
export const BUTTON_HORIZONTAL_PADDING = 16 * DP
export const TEXT_FONT_SIZE_PX = 15 * DP
export const SUBTITLE_FONT_SIZE_PX = 15 * DP
export const TITLE_FONT_SIZE_PX = 28 * DP

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

// Glass params matching LiquidButton.kt's effects block.
export const GLASS_PARAMS = {
  refractionHeight: 12 * DP,
  refractionAmount: -24 * DP,
  depthEffect: false,
  chromaticAberration: false,
  blurRadius: 2 * DP,
  saturation: 1.5,
  brightness: 0,
  contrast: 1,
}

export const DEFAULT_HIGHLIGHT: GlassHighlight = {
  mode: 0,
  color: [1, 1, 1],
  angle: 45 * Math.PI / 180,
  falloff: 1.0,
  alpha: 0.5, // faithful to HighlightStyle.Default: color = White.copy(alpha = 0.5f)
  widthDp: 0.5,
}

export const DEFAULT_SHADOW = {
  radius: 24 * DP,
  alpha: 0.1,
  offsetX: 0,
  offsetY: (24 / 6) * DP,
  color: [0, 0, 0] as [number, number, number],
}

// 主题调色板(照抄仓库 LIGHT/DARK_PALETTE 的 dialog/button/back 字段)
export interface ThemePalette {
  dialogContentColor: [number, number, number, number]
  dialogAccent: [number, number, number, number]
  dialogContainer: [number, number, number, number]
  dialogDim: [number, number, number, number]
  dialogBlurRadius: number
  dialogBrightness: number
  backIconColor: [number, number, number, number]
  buttonSurface: [number, number, number, number]
}

export const LIGHT_PALETTE: ThemePalette = {
  dialogContentColor: [0, 0, 0, 1],
  dialogAccent: [0x00 / 255, 0x88 / 255, 0xff / 255, 1],
  dialogContainer: [0xfa / 255, 0xfa / 255, 0xfa / 255, 0.6],
  dialogDim: [0x29 / 255, 0x29 / 255, 0x3a / 255, 0.23],
  dialogBlurRadius: 16 * DP,
  dialogBrightness: 0.2,
  backIconColor: [0, 0, 0, 1],
  buttonSurface: [1, 1, 1, 0.3],
}

export const DARK_PALETTE: ThemePalette = {
  dialogContentColor: [1, 1, 1, 1],
  dialogAccent: [0x00 / 255, 0x91 / 255, 0xff / 255, 1],
  dialogContainer: [0x12 / 255, 0x12 / 255, 0x12 / 255, 0.4],
  dialogDim: [0x12 / 255, 0x12 / 255, 0x12 / 255, 0.56],
  dialogBlurRadius: 8 * DP,
  dialogBrightness: 0,
  backIconColor: [1, 1, 1, 1],
  buttonSurface: [0x12 / 255, 0x12 / 255, 0x12 / 255, 0.4],
}

export function getPalette(isLightTheme: boolean): ThemePalette {
  return isLightTheme ? LIGHT_PALETTE : DARK_PALETTE
}

// 文本测量(隐藏 2D canvas)
let _measureCtx: CanvasRenderingContext2D | null = null
export function measureTextWidth(text: string, fontPx: number, weight = 400): number {
  if (typeof document !== 'undefined') {
    if (!_measureCtx) {
      const c = document.createElement('canvas')
      _measureCtx = c.getContext('2d')
    }
    if (_measureCtx) {
      _measureCtx.font = `${weight} ${fontPx}px ${FONT_FAMILY}`
      return _measureCtx.measureText(text).width
    }
  }
  return text.length * fontPx * 0.55
}

// 极简交互类型(vanilla 宿主自实现命中测试,这里仅作类型占位)
export interface ElementInteraction {
  onTap?: (pos: { x: number; y: number }) => void
}
