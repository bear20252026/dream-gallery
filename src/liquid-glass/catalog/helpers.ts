// catalog/helpers.ts — vendored from martin65536/liquid-glass-webgl (Apache-2.0)
// 保留 makeGlassShape/makeButton/makeText/makePlainRect/applyVerticalCenter(照抄实现),
// trim 掉 React 依赖与拖拽工厂(makeDragInteractions/makeLiquidSlider/makeTabDragInteractions/makeBackButton/makeThemeToggleButton)。
import type { GlassElementConfig, GlassHighlight } from '../renderer/types'
import {
  DEFAULT_HIGHLIGHT,
  DEFAULT_SHADOW,
  DP,
  GLASS_PARAMS,
  TEXT_FONT_SIZE_PX,
} from './types'

export function makeButton(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  spec: {
    label: string
    tintColor: [number, number, number, number]
    surfaceColor: [number, number, number, number]
    labelColor: [number, number, number, number]
    labelFontSizePx?: number
  },
  scroll = true
): GlassElementConfig {
  return {
    id,
    kind: 'button',
    rect,
    ...GLASS_PARAMS,
    cornerRadius: rect.h / 2,
    tintColor: spec.tintColor,
    surfaceColor: spec.surfaceColor,
    highlight: { ...DEFAULT_HIGHLIGHT },
    outerShadow: { ...DEFAULT_SHADOW },
    label: spec.label,
    labelColor: spec.labelColor,
    labelFontSizePx: spec.labelFontSizePx,
    showChevron: false,
    isInteractive: true,
    scroll,
  }
}

export function makeText(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  text: string,
  opts: {
    color?: [number, number, number, number]
    fontSizePx?: number
    fontWeight?: number
    align?: 'left' | 'center' | 'right'
    wrap?: boolean
    paddingPx?: number
    valign?: 'top' | 'center' | 'bottom'
    maxLines?: number
    halo?: 'auto' | 'light' | 'dark' | 'none'
    icon?: { path: string; size: number; color: [number, number, number, number]; viewport?: number; layoutSize?: number }
    pressTintColor?: [number, number, number, number]
  } = {},
  scroll = true
): GlassElementConfig {
  return {
    id,
    kind: 'text',
    rect,
    cornerRadius: 0,
    refractionHeight: 0,
    refractionAmount: 0,
    depthEffect: false,
    chromaticAberration: false,
    blurRadius: 0,
    saturation: 1,
    brightness: 0,
    contrast: 1,
    tintColor: [0, 0, 0, 0],
    surfaceColor: [0, 0, 0, 0],
    highlight: null,
    outerShadow: null,
    label: '',
    labelColor: [0, 0, 0, 1],
    showChevron: false,
    isInteractive: false,
    pressTintColor: opts.pressTintColor,
    scroll,
    text: {
      content: text,
      color: opts.color ?? [0, 0, 0, 1],
      fontSizePx: opts.fontSizePx ?? TEXT_FONT_SIZE_PX,
      fontWeight: opts.fontWeight ?? 400,
      align: opts.align ?? 'left',
      wrap: opts.wrap ?? false,
      paddingPx: opts.paddingPx ?? 16,
      valign: opts.valign,
      maxLines: opts.maxLines,
      halo: opts.halo ?? 'auto',
      icon: opts.icon,
    },
  }
}

export function makePlainRect(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  color: [number, number, number, number],
  cornerRadius = 0,
  scroll = true
): GlassElementConfig {
  return {
    id,
    kind: 'plain-rect',
    rect,
    cornerRadius,
    refractionHeight: 0,
    refractionAmount: 0,
    depthEffect: false,
    chromaticAberration: false,
    blurRadius: 0,
    saturation: 1,
    brightness: 0,
    contrast: 1,
    tintColor: [0, 0, 0, 0],
    surfaceColor: [0, 0, 0, 0],
    highlight: null,
    outerShadow: null,
    label: '',
    labelColor: [0, 0, 0, 1],
    showChevron: false,
    isInteractive: false,
    scroll,
    plainRect: { color },
  }
}

export function makeGlassShape(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  opts: {
    cornerRadius?: number
    refractionHeight?: number
    refractionAmount?: number
    blurRadius?: number
    saturation?: number
    brightness?: number
    contrast?: number
    surfaceColor?: [number, number, number, number]
    highlight?: GlassHighlight | null
    outerShadow?: typeof DEFAULT_SHADOW | null
    innerShadow?: { radius: number; alpha: number; offsetX: number; offsetY: number; color?: [number, number, number] } | null
    depthEffect?: boolean
    chromaticAberration?: boolean
  } = {},
  scroll = true
): GlassElementConfig {
  return {
    id,
    kind: 'glass-shape',
    rect,
    cornerRadius: opts.cornerRadius ?? rect.h / 2,
    refractionHeight: opts.refractionHeight ?? 12 * DP,
    refractionAmount: opts.refractionAmount ?? -24 * DP,
    depthEffect: opts.depthEffect ?? false,
    chromaticAberration: opts.chromaticAberration ?? false,
    blurRadius: opts.blurRadius ?? 2 * DP,
    saturation: opts.saturation ?? 1.5,
    brightness: opts.brightness ?? 0,
    contrast: opts.contrast ?? 1,
    tintColor: [0, 0, 0, 0],
    surfaceColor: opts.surfaceColor ?? [0, 0, 0, 0],
    highlight: opts.highlight !== undefined ? opts.highlight : { ...DEFAULT_HIGHLIGHT },
    outerShadow: opts.outerShadow !== undefined ? opts.outerShadow : { ...DEFAULT_SHADOW },
    label: '',
    labelColor: [0, 0, 0, 1],
    showChevron: false,
    isInteractive: false,
    scroll,
    innerShadow: opts.innerShadow ?? null,
  }
}

// applyVerticalCenter — 垂直居中平移(照抄;对 pilot dialog 不调用,保留备用)
export function applyVerticalCenter(
  elements: GlassElementConfig[],
  contentTop: number,
  contentHeight: number,
  H: number
): number {
  const contentSize = contentHeight - contentTop
  if (contentSize >= H) return contentHeight
  const yOffset = Math.max(0, (H - contentSize) / 2 - contentTop)
  if (yOffset <= 0) return contentHeight
  for (const el of elements) {
    if (el.id === '__back__' || el.id === '__theme__') continue
    if (el.scroll === false && el.id !== '__pickimage__') continue
    el.rect = { ...el.rect, y: el.rect.y + yOffset }
    if (el.hitRect) {
      el.hitRect = { ...el.hitRect, y: el.hitRect.y + yOffset }
    }
    if (el.isToggleKnob && el.isToggleKnob.trackOriginalY != null) {
      el.isToggleKnob.trackOriginalY += yOffset
    }
    if (el.isBottomTabIndicator && el.isBottomTabIndicator.containerRect) {
      el.isBottomTabIndicator.containerRect = {
        ...el.isBottomTabIndicator.containerRect,
        y: el.isBottomTabIndicator.containerRect.y + yOffset,
      }
    }
    if (el.isBottomTabContent && el.isBottomTabContent.containerCenterY != null) {
      el.isBottomTabContent.containerCenterY += yOffset
    }
    if (el.isBottomTabIndicator && el.isBottomTabIndicator.containerCenterY != null) {
      el.isBottomTabIndicator.containerCenterY += yOffset
    }
    if (el.isBottomTabIndicator && el.isBottomTabIndicator.tabContentRects) {
      el.isBottomTabIndicator.tabContentRects = el.isBottomTabIndicator.tabContentRects.map(r => ({
        ...r, y: r.y + yOffset,
      }))
    }
  }
  return contentHeight + yOffset
}
