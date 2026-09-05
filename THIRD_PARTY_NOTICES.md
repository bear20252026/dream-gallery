# 第三方素材与代码许可声明

本游戏包含来自外部开源/可自由使用来源的 3D 模型、音频与代码。全部用于本地研究与游戏内展示，均保留原署名要求。请勿在未确认许可的情况下二次分发或商用。

## 3D 模型

| 文件 | 用途 | 来源 / 许可 |
|---|---|---|
| `models/hall/b612-gate-moss.glb` | 主世界苔藓古石门 | 用户提供;源自 Sketchfab 等开放模型库;按原下载许可使用 |
| `models/hall/b612-world/portal-platform.glb` | 独立世界传送石台 | 同上(portal.glb 压缩产物,已隐藏外围柱) |
| `models/hall/b612-world/king-scene.glb` | 国王星球场景 | `el_principito-_escena_con_el_rey.glb`(小王子国王场景) |
| `models/hall/b612-world/b612-storybook.glb` | B612 故事场景 | `storybookchallenge_-_the_little_prince.glb` |
| `models/hall/b612-world/purple-planet.glb` | 远景紫色行星 | `purple_planet.glb`(Sketchfab 风格) |
| `models/hall/b612-world/kepler.glb` | 远景行星 | `kepler-452b.glb` |
| `models/hall/b612-world/exoplanets.glb` | 系外行星群 | `exoplanets.glb` |
| `models/hall/b612-world/various-planets.glb` | 多行星远景 | `various_planets.glb` |
| `models/showcase/ArchOfConstantine.glb` | 本地陈列(未接入主线) | 用户本地参考 |

以上压缩产物均经 gltf-transform(meshopt/webp)压缩，原始大文件保留在用户本地 Downloads，未进入仓库。

## 音频

| 文件 | 用途 | 来源 |
|---|---|---|
| `media/gargantua/gargantua-intro.mp3` | 终幕开启 | 用户提供(来自 GARGANTUA 项目) |
| `media/gargantua/gargantua-main.mp3` | B612/终幕环境音乐 | 同上 |

## 代码 / Shader

| 文件 | 用途 | 来源 |
|---|---|---|
| `dev/kimi-planets/gargantua/**` | 黑洞光线追踪参考(未打包进生产) | GARGANTUA Schwarzschild raytracer(用户提供) |
| 开场手绘/古地图动画 | 开幕电影 | 本项目自研 |

## 合规说明

- 本仓库为公开仓库,但以上模型/音频原文件并非本仓库作者原创;已通过压缩、隐藏柱体、仅用于非商用展示等方式使用。
- 若原素材要求署名,请按各来源标注作者与许可后再发布/商用。
- 项目内 `THIRD_PARTY_NOTICES.md` 需随仓库同步更新。
