// ============================================================
// 模块清单 — 全站加载顺序注册表
// 增删功能：在此文件增删一行，不用碰 main.js 的 31 个 import
// 2026-08-01 架构优化
// ============================================================

/**
 * 模块注册清单。数组顺序即加载顺序。
 * 每项：{ name, path, group }
 * - name: 模块名（用于调试和日志）
 * - path: 相对 src/ 的导入路径
 * - group: 分组（用于日志/文档）
 */
export const MODULES = [
  // ── 冷核心（最先加载，全站基础设施）──
  { name: 'overlay', path: './ui/overlay.js', group: 'core' },
  { name: 'store', path: './state/store.js', group: 'core' },

  // ── 3D 场景（依赖冷核心）──
  { name: 'scene', path: './scene/scene.js', group: 'scene' },
  { name: 'effects', path: './scene/effects.js', group: 'scene' },
  { name: 'media', path: './scene/media.js', group: 'scene' },

  // ── 户外元素 ──
  { name: 'signs', path: './gallery/signs.js', group: 'gallery' },
  { name: 'markers', path: './gallery/markers.js', group: 'gallery' },
  { name: 'links', path: './gallery/links.js', group: 'gallery' },
  { name: 'paintings', path: './gallery/paintings.js', group: 'gallery' },
  { name: 'mode', path: './gallery/mode.js', group: 'gallery' },

  // ── 门禁与交互（依赖场景就绪）──
  { name: 'settings', path: './gate/settings.js', group: 'gate' },
  { name: 'upload', path: './gate/upload.js', group: 'gate' },
  { name: 'housecolor', path: './gate/housecolor.js', group: 'gate' },
  { name: 'quiz', path: './gate/quiz.js', group: 'gate' },

  // ── 3D 扩展（晚于门禁，依赖沙漠场景）──
  { name: 'desert', path: './scene/desert.js', group: 'scene' },
  { name: 'player', path: './scene/player.js', group: 'scene' },

  // ── 入口（quizgate 在 settings 之后，prologue 最后）──
  { name: 'quizgate', path: './gate/quizgate.js', group: 'gate' },
  { name: 'prologue', path: './gate/prologue.js', group: 'gate' },

  // ── 神话层（依赖全部场景和门禁就绪）──
  { name: 'peaks', path: './kunlun/peaks.js', group: 'kunlun' },
  { name: 'spirits', path: './kunlun/spirits.js', group: 'kunlun' },
  { name: 'eternal', path: './kunlun/eternal.js', group: 'kunlun' },
  { name: 'ark', path: './kunlun/ark.js', group: 'kunlun' },
  { name: 'windchime', path: './kunlun/windchime.js', group: 'kunlun' },
  { name: 'fireplace', path: './kunlun/fireplace.js', group: 'kunlun' },
  { name: 'snowwin', path: './kunlun/snowwin.js', group: 'kunlun' },
  { name: 'resetview', path: './kunlun/resetview.js', group: 'kunlun' },
];
